import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createSecretStore } from "../src/secrets.mjs";
import { plausibleDuration, transcribeWav, geminiSttModel } from "../src/stt.mjs";
import { verifiedNarration } from "../src/narration.mjs";
import { buildServer, voiceFor } from "../src/server.mjs";
import { wavFromPcm } from "../src/gemini-live.mjs";
import { fixedGroup } from "../src/episode-content.mjs";
import { generateWithCodex } from "../src/codex-engine.mjs";
import { audioTimeline, GAPS, blueprint, questionNumbers } from "../public/lib/exams.mjs";
import { startAttempt } from "../public/lib/attempt.mjs";

const wavOf = (seconds, rate = 24000) =>
  wavFromPcm([Buffer.alloc(Math.round(seconds * rate) * 2, 1)], Math.round(seconds * rate) * 2, rate);
const xor = {
  scheme: "test-xor",
  protect: async (b) => Buffer.from(b.map((x) => x ^ 0x5a)),
  unprotect: async (b) => Buffer.from(b.map((x) => x ^ 0x5a)),
};
const tmp = async (t, name) => {
  const root = await mkdtemp(join(tmpdir(), name));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};

test("API keys are stored encrypted, survive reloads, and can be removed", async (t) => {
  const root = await tmp(t, "ml-keys-");
  const file = join(root, "keys.json");
  const store = createSecretStore(file, xor);
  await store.save({ gemini: "AIza-secret-key-123", openai: "" });
  assert.equal((await readFile(file, "utf8")).includes("AIza-secret"), false);
  assert.deepEqual(await createSecretStore(file, xor).load(), { gemini: "AIza-secret-key-123" });
  assert.deepEqual(await createSecretStore(file, { ...xor, scheme: "other" }).load(), {});
  await store.save({});
  await assert.rejects(stat(file));
});

test("narration length check rejects a one-word clip for a whole sentence", () => {
  const script = "The meeting has been moved to the third floor conference room.";
  assert.equal(plausibleDuration(script, 0.4).ok, false);
  assert.match(plausibleDuration(script, 0.4).reason, /짧/);
  assert.equal(plausibleDuration(script, 3.5).ok, true);
  assert.equal(plausibleDuration(script, 30).ok, false);
  assert.equal(plausibleDuration("A. Yes.\nB. No.\nC. Maybe later.", 2.5).ok, true);
});

test("verified narration trusts an independent transcription of the saved audio, not the Live transcript", async () => {
  const script = "The meeting has been moved to the third floor conference room.";
  let n = 0;
  const speak = async () => {
    n++;
    // 1st take: one-word audio; 2nd: right length but the audio says something else; 3rd: correct.
    return { wav: wavOf(n === 1 ? 0.4 : 3.5), transcript: script };
  };
  const heard = ["", "The meeting has been moved.", script];
  let k = 0;
  const r = await verifiedNarration(
    speak,
    { prompt: script },
    { duration: true, transcribe: async () => heard[++k] },
  );
  assert.equal(r.attempts, 3);
  assert.equal(r.sttChecked, true);
  assert.equal(r.liveTranscript, script);
  const failed = await verifiedNarration(
    async () => ({ wav: wavOf(0.3), transcript: script }),
    { prompt: script },
    { duration: true },
  ).catch((e) => e);
  assert.equal(failed.code, "NARRATION_MISMATCH");
  assert.match(failed.last.diff.reason, /짧/);
});

test("transcription requests: Gemini inline WAV and OpenAI transcription endpoint", async () => {
  const calls = [];
  const fetcher = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes("?pageSize"))
      return Response.json({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.1-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.1-flash-tts-preview", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.5-flash-live", supportedGenerationMethods: ["bidiGenerateContent"] },
        ],
      });
    if (String(url).includes("generateContent"))
      return Response.json({ candidates: [{ content: { parts: [{ text: " hello there " }] } }] });
    return Response.json({ text: "hello there" });
  };
  assert.equal(await geminiSttModel("k1", fetcher), "gemini-3.1-flash");
  assert.equal(
    await transcribeWav({ provider: "gemini", apiKey: "k1", wav: wavOf(0.1), fetcher }),
    "hello there",
  );
  const body = JSON.parse(calls.at(-1).opts.body);
  assert.equal(body.contents[0].parts[0].inline_data.mime_type, "audio/wav");
  assert.match(calls.at(-1).url, /gemini-3\.1-flash:generateContent$/);
  assert.equal(
    await transcribeWav({ provider: "openai", apiKey: "sk-test", wav: wavOf(0.1), fetcher }),
    "hello there",
  );
  assert.equal(calls.at(-1).url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(calls.at(-1).opts.body.get("model"), "gpt-transcribe");
});

test("voices rotate per group and conversation speakers never share a voice", () => {
  const e = { groups: blueprint("toeic", { 2: 4, 3: 6 }) };
  const p2 = e.groups.filter((g) => g.part === 2).map((g) => voiceFor("gemini", e, g, { speaker: "A" }));
  assert.ok(new Set(p2).size >= 3, "Part 2 items use several voices");
  for (const g of e.groups.filter((g) => g.part === 2)) {
    assert.notEqual(voiceFor("gemini", e, g, { speaker: "A" }), voiceFor("gemini", e, g, { speaker: "B" }));
  }
  // One narrator everywhere, never used by a speaker.
  const narrators = e.groups.map((g) => voiceFor("gemini", e, g, { speaker: "narrator" }));
  assert.deepEqual([...new Set(narrators)], ["Charon"]);
  for (const g of e.groups.filter((g) => g.part === 3)) {
    const v = ["A", "B", "C", "narrator"].map((speaker) => voiceFor("openai", e, g, { speaker }));
    assert.equal(new Set(v).size, 4, v.join(","));
    const gv = ["A", "B", "C"].map((speaker) => voiceFor("gemini", e, g, { speaker }));
    assert.ok(!gv.includes("Charon"));
  }
});

const ready = (s, seconds) => ({ ...s, status: "ready", duration: seconds, audio: "/x" });

test("the listening timeline uses real-test answer time and adds directions to a full section", () => {
  const groups = blueprint("toeic", { 1: 6, 2: 25, 3: 39, 4: 30 }).map((g) => {
    const f = fixedGroup(g);
    return { ...f, segments: f.segments.map((s) => ready(s, 2)) };
  });
  const clips = {
    "lc-intro": { text: "Listening Test.", duration: 20 },
    "p3-directions": { text: "Part Three.", duration: 10 },
  };
  for (let n = 1; n <= 31; n++) clips[`num-${n}`] = { text: `Number ${n}.`, duration: 1 };
  clips["p1-begin"] = { text: "Part One begins now.", duration: 1 };
  clips["next-page"] = { text: "Please turn to the next page.", duration: 1 };
  const e = { id: "x", exam: "toeic", config: {}, groups, directions: { clips } };
  const t = audioTimeline(e);
  assert.equal(t[0].key, "lc-intro");
  assert.equal(t[1].key, "p1-begin");
  assert.equal(t[2].key, "num-1");
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} ≈ ${b}`);
  near(t[3].start - t[2].end, GAPS.cue);
  near(t[4].start - t[3].end, GAPS.part12, "5 s to answer a Part 1 item");
  // Page turns after questions 2 and 6.
  const pages = t.filter((x) => x.key === "next-page");
  assert.equal(pages.length, 5);
  // Part 2: number cue, question voice, response voice, 5 s.
  const p2 = groups.find((g) => g.part === 2);
  const p2entries = t.filter((x) => x.groupId === p2.id);
  assert.equal(p2entries[0].key, "num-7");
  assert.deepEqual(
    p2entries.slice(1, 3).map((x) => x.role),
    ["prompt", "choices"],
  );
  // Part 3: the narrator introduces the set and reads numbered questions with 8 s to answer.
  const p3 = groups.find((g) => g.part === 3);
  const p3entries = t.filter((x) => x.groupId === p3.id);
  assert.equal(p3entries[0].role, "intro");
  assert.match(p3entries[0].text, /^Questions thirty-two through thirty-four/);
  const q32 = p3entries.findIndex((x) => x.role === "question");
  assert.match(p3entries[q32].text, /^Number thirty-two\. /);
  near(p3entries[q32 + 1].start - p3entries[q32].end, GAPS.part34, "8 s to answer a Part 3 question");
  assert.ok(t.some((x) => x.key === "p3-directions"));
  // Partial episodes never get directions or number cues.
  assert.equal(
    audioTimeline({ ...e, directions: undefined }).some((x) => x.kind === "direction"),
    false,
  );
  // The listening section is never shorter than its audio.
  const long = {
    ...e,
    groups: e.groups.map((g) => ({
      ...g,
      status: "ready",
      segments: g.segments.map((s) => ({ ...s, duration: 20 })),
    })),
  };
  const a = startAttempt(long, 0);
  assert.ok(a.durations.LC >= audioTimeline(long).at(-1).end * 1000);
});

test("codex passes the chosen model", async () => {
  const calls = [];
  const runCommand = async (exe, args) => {
    calls.push(args);
    if (args[0] === "login") return { code: 0, stdout: "Logged in using ChatGPT", stderr: "" };
    return {
      code: 0,
      stdout:
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } }) +
        "\n" +
        JSON.stringify({ type: "turn.completed" }),
      stderr: "",
    };
  };
  await generateWithCodex({ executable: "codex", prompt: "p", model: "gpt-5.5", runCommand });
  assert.deepEqual(calls[1].slice(calls[1].indexOf("--model"), calls[1].indexOf("--model") + 2), [
    "--model",
    "gpt-5.5",
  ]);
  await assert.rejects(
    generateWithCodex({ executable: "codex", prompt: "p", model: "bad model;rm", runCommand }),
    /모델/,
  );
  calls.length = 0;
  await generateWithCodex({ executable: "codex", prompt: "p", effort: "high", runCommand });
  assert.ok(calls[1].join(" ").includes('-c model_reasoning_effort="high"'));
  await assert.rejects(
    generateWithCodex({ executable: "codex", prompt: "p", effort: "max!", runCommand }),
    /추론/,
  );
});

test("server: saved keys, automatic connection checks, model lists, directions and merged-audio checks", async (t) => {
  const root = await tmp(t, "ml-round2-");
  const dir = join(root, "directions");
  await mkdir(dir);
  const clipWav = wavOf(0.5);
  const clipsIndex = {};
  for (const [key, text] of [
    ["lc-intro", "Listening Test."],
    ["p2-directions", "Part Two. Directions."],
  ]) {
    await writeFile(join(dir, key + ".wav"), clipWav);
    clipsIndex[key] = {
      file: key + ".wav",
      text,
      duration: 0.5,
      sha256: createHash("sha256").update(clipWav).digest("hex"),
    };
  }
  await writeFile(join(dir, "index.json"), JSON.stringify({ schema: 1, voice: "Charon", clips: clipsIndex }));
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  let modelCalls = 0;
  const opts = {
    root,
    directionsRoot: dir,
    updater,
    autoUpdate: false,
    autoConnect: true,
    testMode: true,
    secretCodec: xor,
    models: async () => (modelCalls++, [{ id: "live-1" }]),
    textModels: async () => [{ id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" }],
    live: async ({ prompt }) => ({
      wav: wavOf(Math.max(1, prompt.split(/\s+/).length / 2.5)),
      transcript: prompt,
    }),
    stt: async () => {
      throw Error("Gemini must not call a transcription model");
    },
  };
  let { server, store } = await buildServer(opts);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let base = "http://127.0.0.1:" + server.address().port;
  let token = (await (await fetch(base + "/api/session")).json()).token;
  const post = async (path, data) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mark-Session": token },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  await post("settings", { keyProvider: "gemini", apiKey: "MOCK-KEY-1234" });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    (await (await fetch(base + "/api/connections")).json()).gemini,
    "connected",
    "checked automatically after saving the key",
  );
  assert.deepEqual((await post("text-models", { provider: "gemini" })).data.models[0].id, "gemini-3.1-pro");
  server.closeAllConnections();
  await new Promise((r) => server.close(r));

  // Restart: the key is still there and is checked again without user action.
  modelCalls = 0;
  ({ server, store } = await buildServer(opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  base = "http://127.0.0.1:" + server.address().port;
  token = (await (await fetch(base + "/api/session")).json()).token;
  assert.equal((await (await fetch(base + "/api/settings")).json()).keys.gemini, true);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(modelCalls >= 1);
  assert.equal((await (await fetch(base + "/api/connections")).json()).gemini, "connected");

  // Bundled direction clips are served for the exam player.
  assert.equal((await fetch(base + "/api/directions/lc-intro.wav")).status, 200);
  assert.equal((await fetch(base + "/api/directions/num-1.wav")).status, 500);

  // The joined audio is checked group by group without any transcription service.
  const e = await store.create({ counts: { 2: 2 }, fixed: true });
  e.groups = e.groups.map(fixedGroup);
  for (const g of e.groups)
    for (const s of g.segments) await store.saveAudio(e, s, { wav: wavOf(6), transcript: s.text });
  e.groups[1].segments[0].transcript = "wrong words only";
  await store.write(e);
  const first = await post("listening-check", { id: e.id, index: 0 });
  assert.equal(first.status, 200);
  assert.equal(first.data.total, 2);
  assert.equal(first.data.result.exact, true, JSON.stringify(first.data.result.problems));
  const second = await post("listening-check", { id: e.id, index: 1 });
  assert.equal(second.data.result.exact, false, "a take whose transcript differs is reported");
  assert.equal((await post("listening-check", { id: e.id, index: 2 })).data.done, true);
  assert.equal((await store.read(e.id)).listeningCheck.results.length, 2);

  // Gemini narration is checked with the Live transcript and the length check only (no Flash call).
  await post("settings", { liveProvider: "gemini", liveModel: "live-1" });
  await post("models", { provider: "gemini" });
  const live = await post("test-live", { script: "single" });
  assert.equal(live.status, 200);
  // Questions are written by Codex only.
  assert.equal((await post("settings", { textProvider: "gemini" })).status, 400);
});

test("Part 3/4 sets carry their type, graphic table and quoted lines as in the real test", async () => {
  const { parseGroup, setPlan } = await import("../src/episode-content.mjs");
  const g = { id: "p3-11", part: 3, count: 3, status: "pending" };
  assert.ok(setPlan(g).graphic, "sets 62–70 have a graphic");
  assert.equal(setPlan({ id: "p3-6", part: 3 }).kind, "conversation with three speakers");
  const q = (question) => ({ question, choices: ["a", "b", "c", "d"], answer: 0, explanation: "해설" });
  const raw = {
    setType: "conversation and price list",
    graphic: {
      title: "Price List",
      rows: [
        ["Item", "Price"],
        ["Small box", "five dollars"],
        ["Large box", "nine dollars"],
      ],
    },
    turns: [
      { speaker: "A", text: "Hi, I need some boxes." },
      { speaker: "B", text: "Sure. That's a popular size." },
      { speaker: "A", text: "Great, I'll take two." },
    ],
    questions: [
      q("What does the man want?"),
      q("Look at the graphic. How much will the man pay?"),
      q('What does the woman imply when she says, "That\'s a popular size"?'),
    ],
  };
  const e = {
    exam: "toeic",
    // Only Part 3 sets come before this one: numbering still follows the real test (Part 3 starts at 32).
    groups: [{ id: "p2-1", part: 2, count: 25 }, { id: "p3-1", part: 3, count: 30 }, g],
  };
  const parsed = parseGroup(raw, g, e);
  assert.equal(
    parsed.segments[0].text,
    "Questions sixty-two through sixty-four refer to the following conversation and price list.",
  );
  assert.equal(parsed.segments.at(-1).text, `Number sixty-four. ${raw.questions[2].question}`);
  assert.equal(parsed.doc.type, "table");
  assert.equal(parsed.doc.title, "Price List");
  const { solvePrompt } = await import("../src/verify.mjs");
  assert.match(
    solvePrompt({ exam: "toeic" }, parsed),
    /\[Graphic in the test book\]\nPrice List\nItem \| Price/,
  );
  assert.equal(parsed.setType, undefined);
  assert.throws(
    () =>
      parseGroup(
        {
          ...raw,
          questions: [
            raw.questions[0],
            raw.questions[1],
            q('What does he mean when he says, "No way at all"?'),
          ],
        },
        g,
        e,
      ),
    /인용/,
  );
  assert.throws(() => parseGroup({ ...raw, questions: [q("a?"), q("b?"), q("c?")] }, g, e), /그래픽 문항/);
});

test("TOEIC numbering follows the real test book in partial episodes", () => {
  const e = { exam: "toeic", groups: blueprint("toeic", { 2: 3, 3: 6, 5: 2 }) };
  e.groups = e.groups.map((g) => ({
    ...g,
    questions: Array.from({ length: g.count }, (_, i) => ({ id: `${g.id}-q${i + 1}` })),
  }));
  const n = questionNumbers(e);
  assert.deepEqual(
    e.groups.map((g) => n.get(g.questions[0].id)),
    [7, 8, 9, 32, 35, 101, 102],
  );
});

test("Codex failures say why: usage limit, login, model, or Codex's own words", async () => {
  const { generateWithCodex } = await import("../src/codex-engine.mjs");
  const run =
    (stdout, stderr = "") =>
    async (exe, args) =>
      args[0] === "login"
        ? { code: 0, stdout: "Logged in using ChatGPT", stderr: "" }
        : { code: 1, stdout, stderr };
  const go = (r, extra = {}) =>
    generateWithCodex({ executable: "codex", prompt: "p", runCommand: r, ...extra });
  await assert.rejects(
    go(run(JSON.stringify({ type: "error", message: "You've hit your usage limit." }))),
    (e) => e.status === 429 && /사용량/.test(e.message),
  );
  await assert.rejects(
    go(run("", "Error: unexpected status 401 Unauthorized")),
    (e) => e.status === 400 && /로그인/.test(e.message),
  );
  await assert.rejects(
    go(run(JSON.stringify({ type: "turn.failed", error: { message: "The model `gpt-x` does not exist" } })), {
      model: "gpt-x",
    }),
    (e) => e.status === 400 && /gpt-x/.test(e.message),
  );
  await assert.rejects(go(run("", "error: something odd happened")), /something odd happened/);
});
