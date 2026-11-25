import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PhotoLibrary, hamming, sameScene } from "../src/photo-library.mjs";
import { buildServer } from "../src/server.mjs";
import { generateWithCodex } from "../src/codex-engine.mjs";

const jpeg = (n) =>
  Buffer.concat([Buffer.from([255, 216]), Buffer.alloc(40, n), Buffer.from([255, 217])]).toString("base64");
// Scene pairs: k and k+100 are variants of one scene (hash differs in 1 bit); different scenes differ a lot.
const hash = (scene, variant = 0) =>
  (BigInt.asUintN(64, BigInt(scene) * 0x9e3779b97f4a7c15n) ^ BigInt(variant)).toString(16).padStart(16, "0");

async function library(t, entries) {
  const root = await mkdtemp(join(tmpdir(), "ml-photos-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "bundle");
  await mkdir(dir, { recursive: true });
  const photos = [];
  for (const { name, n, dhash } of entries) {
    const bytes = Buffer.from(jpeg(n), "base64");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(dir, sha256.slice(0, 16) + ".jpg"), bytes);
    photos.push({ file: sha256.slice(0, 16) + ".jpg", sha256, name, dhash });
  }
  photos.push({ file: "../escape.jpg", sha256: "0".repeat(64), name: "bad", dhash: null });
  await writeFile(join(dir, "index.json"), JSON.stringify({ schema: 1, photos }));
  return { root, dir, lib: new PhotoLibrary(dir) };
}

test("bundled library lists valid entries only and verifies photo bytes", async (t) => {
  const { lib, dir } = await library(t, [
    { name: "Worker pressing stapler", n: 1, dhash: hash(1) },
    { name: "Two workers folding", n: 2, dhash: hash(2) },
  ]);
  const list = await lib.list();
  assert.equal(list.length, 2);
  assert.equal((await lib.read(list[0].sha256)).length, 44);
  await writeFile(join(dir, list[1].file), "tampered");
  await assert.rejects(new PhotoLibrary(dir).read(list[1].sha256), /손상/);
  await assert.rejects(lib.read("f".repeat(64)), /찾을 수 없/);
});

test("picking never places two variants of the same scene together and prefers unused photos", async (t) => {
  const entries = [];
  for (let s = 1; s <= 6; s++)
    entries.push(
      { name: `s${s}-a`, n: s, dhash: hash(s) },
      { name: `s${s}-b`, n: s + 100, dhash: hash(s, 1) },
    );
  const { lib } = await library(t, entries);
  assert.equal(hamming(hash(3), hash(3, 1)), 1);
  const picked = await lib.pick(6);
  assert.equal(new Set(picked.map((p) => p.name.split("-")[0])).size, 6);
  await assert.rejects(lib.pick(7), /부족/);
  const all = await lib.list();
  const usage = new Map(all.filter((p) => p.name.endsWith("a")).map((p) => [p.sha256, 3]));
  assert.ok((await lib.pick(6, usage)).every((p) => p.name.endsWith("b")));
});

test("the shipped photo set is complete and has no unreadable files", async () => {
  const lib = new PhotoLibrary(new URL("../assets/part1-photos/", import.meta.url).pathname);
  const list = await lib.list();
  assert.ok(list.length >= 100, "expected the bundled Part 1 photo set");
  for (const p of list.slice(0, 5)) assert.ok((await lib.read(p.sha256)).length > 1000);
  assert.equal((await lib.pick(6)).length, 6);
});

test("codex attaches photos with --image before reading the prompt from stdin", async () => {
  const calls = [];
  const runCommand = async (exe, args, opts) => {
    calls.push(args);
    if (args[0] === "login") return { code: 0, stdout: "Logged in using ChatGPT", stderr: "" };
    return {
      code: 0,
      stdout: [
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } }),
        JSON.stringify({ type: "turn.completed" }),
      ].join("\n"),
      stderr: "",
    };
  };
  await generateWithCodex({
    executable: "codex",
    prompt: "p",
    images: [Buffer.from("a"), Buffer.from("b")],
    runCommand,
  });
  const args = calls[1];
  assert.equal(args.filter((a) => a === "--image").length, 2);
  assert.match(args[args.indexOf("--image") + 1], /photo-1\.jpg$/);
  assert.equal(args.at(-1), "-");
});

test("TOEIC Part 1 uses bundled photos, swaps a photo that fails validation and never falls back", async (t) => {
  const { root, dir } = await library(
    t,
    [1, 2, 3, 4].map((s) => ({ name: "scene " + s, n: s, dhash: hash(s) })),
  );
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const visionCalls = [];
  let rejectNext = 1;
  const generate = async ({ prompt, images, provider }) => {
    visionCalls.push({ provider, images: images?.length ?? 0 });
    if (prompt.includes("Independently classify")) {
      const ok = rejectNext-- <= 0;
      return JSON.stringify({
        labels: ["true", "false", "false", "false"],
        ambiguous: !ok,
        duplicate: false,
        evidence: "사진 근거",
      });
    }
    return JSON.stringify({
      choices: [
        "A man is using a stapler.",
        "A man is mopping the floor.",
        "A woman is typing a letter.",
        "Two people are carrying boxes.",
      ],
      answer: 0,
    });
  };
  // Photo questions are written by Codex (with the photo as an --image attachment).
  const codex = (args) => generate({ ...args, provider: "codex" });
  const { server } = await buildServer({ root, photoRoot: dir, updater, autoUpdate: false, codex });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const token = (await (await fetch(base + "/api/session")).json()).token;
  const post = async (path, data) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mark-Session": token },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  for (const removed of ["photos", "photos/x.jpg"])
    assert.equal((await fetch(base + "/api/" + removed)).status, 404);
  assert.equal((await post("photos/import", { items: [] })).status, 404);
  assert.match((await post("episodes", { exam: "toeic", counts: { 1: 5 } })).data.error, /부족/);

  const { data: e } = await post("episodes", { exam: "toeic", counts: { 1: 2 } });
  assert.equal(e.photoPart1, true);
  assert.ok(e.groups.every((g) => g.photoHash && g.image.startsWith("/api/photo/")));
  assert.equal((await fetch(base + e.groups[0].image)).status, 200);

  assert.equal((await post("settings", { visionProvider: "gemini" })).status, 400, "Codex only");
  const firstPhoto = e.groups[0].photoHash;
  let r = await post("produce", { id: e.id });
  assert.equal(r.status, 200);
  assert.equal(r.data.episode.groups[0].status, "pending", "a rejected photo is retried internally");
  assert.notEqual(r.data.episode.groups[0].photoHash, firstPhoto, "with a different bundled photo");
  while (r.data.episode.groups.some((g) => g.status !== "ready")) r = await post("produce", { id: e.id });
  const ready = r.data.episode;
  assert.ok(ready.groups.every((g) => g.verified && g.questions[0].part === 1));
  assert.match(ready.groups[0].segments[0].text, /^A\. A man is using a stapler\.\nB\./);
  assert.ok(visionCalls.every((c) => c.provider === "codex" && c.images >= 1));
  assert.equal(new Set(ready.groups.map((g) => g.photoHash)).size, 2);
});

test("text groups are re-solved by a separate call and regenerated when the key does not match", async (t) => {
  const { root, dir } = await library(t, []);
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  let solves = 0;
  const generate = async ({ prompt }) => {
    if (prompt.includes("independently checking")) {
      assert.equal(prompt.includes("explanation"), false);
      return JSON.stringify({ answers: [solves++ === 0 ? 2 : 1] });
    }
    return JSON.stringify({
      questions: [
        {
          question: "The report was _____ by Friday.",
          choices: ["complete", "completed", "completing", "completes"],
          answer: 1,
          explanation: "수동태",
        },
      ],
    });
  };
  const { server } = await buildServer({
    root,
    photoRoot: dir,
    updater,
    autoUpdate: false,
    codex: (args) => generate({ ...args, provider: "codex" }),
    testMode: false,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const session = await (await fetch(base + "/api/session")).json();
  assert.equal(session.testMode, false);
  const post = async (path, data) =>
    (
      await fetch(base + "/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mark-Session": session.token },
        body: JSON.stringify(data),
      })
    ).json();
  const e = await post("episodes", { exam: "toeic", counts: { 5: 1 } });
  let r = await post("produce", { id: e.id });
  assert.equal(r.episode.groups[0].status, "pending");
  assert.match(r.episode.groups[0].lastError, /정답 불일치/);
  r = await post("produce", { id: e.id });
  assert.equal(r.episode.groups[0].status, "ready");
  assert.equal(r.episode.groups[0].tries, 2);
  // Release builds expose no test-only routes.
  assert.equal((await fetch(`${base}/api/listening/${e.id}.wav`)).status, 404);
  assert.equal((await post("episodes/swap-photo", { id: e.id, groupId: "p5-1" })).error, "API 없음");
});

test("scene variants are matched by descriptive names even when pixels differ", () => {
  const p = (name, dhash = "0000000000000000") => ({ name, dhash });
  const far = "ffffffffffffffff";
  assert.ok(sameScene(p("Adult clipping dog leash"), p("Adult clips leash to dog", far)));
  assert.ok(sameScene(p("Adult loading clothes into washer"), p("Adult loading laundry into machine", far)));
  assert.ok(sameScene(p("Empty planters flank closed door"), p("Empty planters outside closed door", far)));
  assert.equal(
    sameScene(p("Adult copying paper in office"), p("Adult loading laundry into machine", far)),
    false,
  );
  assert.equal(sameScene(p("IMG 1234"), p("IMG 5678", far)), false);
  assert.ok(sameScene(p("IMG 1234"), p("IMG 5678")), "identical pixels");
});
