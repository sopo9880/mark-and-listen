import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

async function library(t) {
  const root = await mkdtemp(join(tmpdir(), "ml-photos-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, lib: new PhotoLibrary(join(root, "photos")) };
}

test("library imports JPEGs once, rejects non-JPEG data and removes photos", async (t) => {
  const { lib } = await library(t);
  const r = await lib.import([
    { name: "Worker_pressing_stapler", data: jpeg(1), dhash: hash(1) },
    { name: "copy", data: jpeg(1), dhash: hash(1) },
    { name: "Two_workers", data: jpeg(2), dhash: hash(2) },
  ]);
  assert.deepEqual(r, { added: 2, duplicates: 1, total: 2 });
  await assert.rejects(
    lib.import([{ name: "png", data: Buffer.from("\x89PNG....").toString("base64") }]),
    /JPEG/,
  );
  await assert.rejects(lib.import([]), /1~12/);
  const [first] = await lib.list();
  assert.equal((await lib.read(first.sha256)).length, 44);
  assert.deepEqual(await lib.remove([first.sha256]), { removed: 1, total: 1 });
});

test("picking never places two variants of the same scene together and prefers unused photos", async (t) => {
  const { lib } = await library(t);
  for (let s = 1; s <= 6; s++)
    await lib.import([
      { name: `s${s}-a`, data: jpeg(s), dhash: hash(s) },
      { name: `s${s}-b`, data: jpeg(s + 100), dhash: hash(s, 1) },
    ]);
  assert.equal(hamming(hash(3), hash(3, 1)), 1);
  const picked = await lib.pick(6);
  const scenes = picked.map((p) => p.name.split("-")[0]);
  assert.equal(new Set(scenes).size, 6);
  await assert.rejects(lib.pick(7), /부족/);
  const all = await lib.list();
  const usage = new Map(all.filter((p) => p.name.endsWith("a")).map((p) => [p.sha256, 3]));
  assert.ok((await lib.pick(6, usage)).every((p) => p.name.endsWith("b")));
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

test("TOEIC episodes take Part 1 photos from the library and require a vision engine (no illustration fallback)", async (t) => {
  const { root } = await library(t);
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const visionCalls = [];
  const generate = async ({ prompt, images, provider }) => {
    visionCalls.push({ provider, images: images?.length ?? 0 });
    if (prompt.includes("Independently classify"))
      return JSON.stringify({
        labels: ["true", "false", "false", "false"],
        ambiguous: false,
        duplicate: false,
        evidence: "사진 근거",
      });
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
  const { server } = await buildServer({ root, updater, autoUpdate: false, generate });
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
  assert.match(
    (await post("episodes", { exam: "toeic", counts: { 1: 2 }, part1: "photos" })).data.error,
    /부족/,
  );
  await post("photos/import", {
    items: [1, 2, 3].map((s) => ({ name: "scene " + s, data: jpeg(s), dhash: hash(s) })),
  });
  const listed = (await (await fetch(base + "/api/photos")).json()).photos;
  assert.equal(listed.length, 3);
  assert.equal((await fetch(`${base}/api/photos/${listed[0].sha256}.jpg`)).status, 200);

  const { data: e } = await post("episodes", { exam: "toeic", counts: { 1: 2, 5: 0 }, part1: "photos" });
  assert.equal(e.photoPart1, true);
  assert.ok(e.groups.every((g) => g.photoHash && g.image.startsWith("/api/photo/")));
  assert.equal((await fetch(base + e.groups[0].image)).status, 200);

  // Default vision engine is Codex, which is not installed in this test → clear failure, no fallback.
  await post("settings", { visionProvider: "gemini" });
  const missingKey = await post("produce", { id: e.id });
  assert.equal(missingKey.status, 502);
  assert.match(missingKey.data.error, /사진 문항 엔진/);
  await post("settings", { keyProvider: "gemini", apiKey: "MOCK-KEY" });
  let r;
  do r = await post("produce", { id: e.id });
  while (r.data.more && r.data.episode.groups.some((g) => g.status !== "ready"));
  const ready = r.data.episode;
  assert.ok(ready.groups.every((g) => g.status === "ready" && g.questions[0].part === 1));
  assert.equal(ready.groups[0].segments.length, 1);
  assert.match(ready.groups[0].segments[0].text, /^A\. A man is using a stapler\.\nB\./);
  // Second photo is compared against the first one for scene duplicates.
  assert.deepEqual(
    visionCalls.map((c) => c.images),
    [1, 1, 1, 2],
  );
  assert.ok(visionCalls.every((c) => c.provider === "gemini"));

  // The next episode prefers the unused third photo.
  const { data: next } = await post("episodes", { exam: "toeic", counts: { 1: 1 }, part1: "photos" });
  const unused = listed.find((p) => !e.groups.some((g) => g.photoHash === p.sha256));
  assert.equal(next.groups[0].photoHash, unused.sha256);

  // A photo can be swapped for another one that does not repeat a scene already in the episode.
  await post("photos/import", { items: [{ name: "scene 4", data: jpeg(4), dhash: hash(4) }] });
  const swapped = (await post("episodes/swap-photo", { id: next.id, groupId: next.groups[0].id })).data;
  assert.notEqual(swapped.groups[0].photoHash, next.groups[0].photoHash);
  assert.equal(swapped.groups[0].status, "pending");
  assert.equal((await post("episodes/swap-photo", { id: e.id, groupId: "p5-1" })).status, 400);
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
