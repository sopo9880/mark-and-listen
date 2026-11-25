import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EpisodeStore, transcriptDiff } from "../src/episode-store.mjs";
import { fixedGroup, parseGroup } from "../src/episode-content.mjs";
import { EXAMS, blueprint, audioReady, phaseDurations } from "../public/lib/exams.mjs";
import { startAttempt, markAttempt, advanceAttempt, finishPhase } from "../public/lib/attempt.mjs";
import { wavFromPcm } from "../src/gemini-live.mjs";
import { buildServer } from "../src/server.mjs";
import { listLiveModels } from "../src/live-models.mjs";
const wav = () => wavFromPcm([Buffer.alloc(4800, 1)], 4800, 24000);
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "ml-beta-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new EpisodeStore(root).init();
}
test("full blueprint has exact 200 distribution and preserves all grouped documents", () => {
  const groups = blueprint(
    "toeic",
    Object.fromEntries(Object.entries(EXAMS.toeic.parts).map(([p, s]) => [p, s.count])),
  );
  assert.equal(
    groups.reduce((n, g) => n + g.count, 0),
    200,
  );
  assert.equal(
    groups.filter((g) => g.part <= 4).reduce((n, g) => n + g.count, 0),
    100,
  );
  assert.equal(groups.filter((g) => g.part === 7 && g.documents === 3).length, 3);
  assert.throws(() => blueprint("toeic", { 3: 4 }));
  assert.throws(() => blueprint("toeic", { 6: 5 }));
  assert.throws(() => blueprint("toeic", { 7: 1 }));
  assert.throws(() => blueprint("unknown", { 2: 5 }));
});
test("Part 2 five questions: persisted audio, review gate, restart, offline OMR grading", async (t) => {
  const store = await setup(t),
    e = await store.create({ counts: { 2: 5 }, title: "P2" });
  e.groups = e.groups.map(fixedGroup);
  assert.throws(() => startAttempt(e));
  for (const g of e.groups) {
    g.reviewed = true;
    for (const s of g.segments) {
      await store.saveAudio(e, s, { wav: wav(), transcript: s.text });
      assert.equal(s.reviewed, false);
      s.reviewed = true;
    }
  }
  await store.write(e);
  const reopened = new EpisodeStore(store.root);
  assert.equal(audioReady(await reopened.read(e.id)), true);
  const attempt = await reopened.begin(e.id);
  for (const q of e.groups.flatMap((g) => g.questions))
    await reopened.attempt(e.id, attempt.id, { type: "mark", questionId: q.id, index: q.answer });
  const done = await reopened.attempt(e.id, attempt.id, { type: "next" });
  assert.equal(done.phase, "done");
  assert.equal(done.summary.correct, 5);
  assert.equal(done.summary.unsolved, 0);
  assert.equal((await reopened.read(e.id)).attempts[0].summary.correct, 5);
  await writeFile(await reopened.audio(e.id, e.groups[0].segments[0].id), "corrupted");
  await assert.rejects(reopened.begin(e.id), /손상/);
});
test("Part 3 preserves alternating speakers and question prompts; full LC includes all 100", async (t) => {
  const store = await setup(t),
    e = await store.create({ counts: { 1: 6, 2: 25, 3: 39, 4: 30 } });
  e.groups = e.groups.map(fixedGroup);
  assert.equal(e.groups.flatMap((g) => g.questions).length, 100);
  for (const g of e.groups.filter((g) => g.part === 3)) {
    assert.ok(new Set(g.segments.map((s) => s.speaker)).size >= 2);
    assert.equal(g.questions.length, 3);
    assert.deepEqual(
      g.segments.slice(-3).map((s) => s.text),
      g.questions.map((q) => q.question),
    );
  }
  for (const g of e.groups) {
    g.reviewed = true;
    for (const s of g.segments) {
      await store.saveAudio(e, s, { wav: wav(), transcript: s.text });
      s.reviewed = true;
    }
  }
  await store.write(e);
  assert.equal(audioReady(await store.read(e.id)), true);
  const a = await store.begin(e.id);
  assert.equal(a.durations.LC, 2700000);
});
test("wall clock boundaries lock late marks, preserve zero, transition once and grade after restart", () => {
  const e = {
    id: "one",
    exam: "toeic",
    groups: [
      { ...fixedGroup(blueprint("toeic", { 2: 1 })[0]), reviewed: true },
      {
        id: "p5-1",
        part: 5,
        count: 1,
        status: "ready",
        reviewed: true,
        questions: [{ id: "p5-1-q1", section: "RC", choices: ["a", "b", "c", "d"], answer: 0 }],
        segments: [],
      },
    ],
  };
  for (const s of e.groups[0].segments) {
    s.status = "ready";
    s.reviewed = true;
    s.duration = 0.1;
  }
  let a = startAttempt(e, 1000);
  a = markAttempt(a, e, e.groups[0].questions[0].id, 0, 1001);
  assert.equal(a.marks[e.groups[0].questions[0].id], 0);
  const rc = markAttempt(a, e, e.groups[0].questions[0].id, 1, a.phaseEndsAt);
  assert.equal(rc.phase, "RC");
  assert.equal(rc.marks[e.groups[0].questions[0].id], 0);
  assert.equal(finishPhase(a, a.phaseEndsAt).phase, "RC");
  assert.equal(advanceAttempt(a, a.phaseEndsAt + a.durations.RC).phase, "done");
});
test("transcript comparison flags omitted numbers and added text", () => {
  assert.equal(transcriptDiff("three copies", "three copies.").exact, true);
  assert.deepEqual(transcriptDiff("ten fifteen", "ten fifty").missing, ["15"]);
  assert.ok(transcriptDiff("Hello", "Hello there").added.includes("there"));
  assert.equal(transcriptDiff("Hello", "").exact, false);
});
test("model discovery paginates and filters non-Live and transcription-only models", async () => {
  let n = 0;
  const models = await listLiveModels({
    provider: "gemini",
    apiKey: "MOCK-KEY",
    fetcher: async (url, opts) => {
      assert.ok(opts.headers["x-goog-api-key"]);
      n++;
      return Response.json(
        n === 1
          ? {
              models: [{ name: "models/text-only", supportedGenerationMethods: ["generateContent"] }],
              nextPageToken: "next",
            }
          : {
              models: [
                { name: "models/gemini-test-live", supportedGenerationMethods: ["bidiGenerateContent"] },
              ],
            },
      );
    },
  });
  assert.equal(n, 2);
  assert.deepEqual(
    models.map((x) => x.id),
    ["gemini-test-live"],
  );
  const o = await listLiveModels({
    provider: "openai",
    apiKey: "MOCK-KEY",
    fetcher: async () =>
      Response.json({
        data: [
          { id: "gpt-live-1" },
          { id: "gpt-realtime" },
          { id: "whisper-1" },
          { id: "gpt-4o-mini-transcribe" },
          { id: "gpt-5" },
        ],
      }),
  });
  assert.equal(o.length, 2);
});
test("server preserves success after quota, retries only failed segment, never makes provider calls in offline attempt", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-api-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0,
    fail = false,
    offline = false;
  const mock = async ({ prompt, provider, voice }) => {
    assert.equal(offline, false);
    assert.equal(provider, "gemini");
    assert.ok(["Kore", "Aoede", "Leda", "Zephyr", "Puck", "Charon", "Orus", "Fenrir"].includes(voice));
    calls++;
    if (fail) throw Object.assign(Error("SECRET-MUST-NOT-LEAK"), { status: 429 });
    return { wav: wav(), transcript: prompt };
  };
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const { server, store } = await buildServer({
    root,
    updater,
    autoUpdate: false,
    live: mock,
    models: async () => [{ id: "gemini-mock-live" }],
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = "http://127.0.0.1:" + server.address().port,
    token = (await (await fetch(base + "/api/session")).json()).token;
  const post = async (path, data) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mark-Session": token },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal(
    (await fetch(base + "/api/library", { headers: { Origin: "https://evil.example" } })).status,
    403,
  );
  await post("settings", {
    keyProvider: "gemini",
    apiKey: "MOCK-KEY",
    liveProvider: "gemini",
    liveModel: "gemini-mock-live",
  });
  await post("models", { provider: "gemini" });
  const { data: e } = await post("episodes", { counts: { 2: 2 } });
  await post("produce", { id: e.id, fixed: true });
  await post("produce", { id: e.id, fixed: true });
  assert.equal((await post("attempt/start", { id: e.id })).status, 409);
  await post("produce", { id: e.id });
  fail = true;
  const failure = await post("produce", { id: e.id });
  assert.equal(failure.status, 429);
  assert.equal(JSON.stringify(failure).includes("SECRET"), false);
  let saved = await store.read(e.id);
  assert.equal(saved.groups[0].segments[0].status, "ready");
  assert.equal(saved.groups[1].segments[0].status, "pending");
  // Reopen process: successful fragments and saved API keys survive.
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fail = false;
  const reopened = await buildServer({
    root,
    updater,
    autoUpdate: false,
    live: mock,
    models: async () => [{ id: "gemini-mock-live" }],
  });
  await new Promise((r) => reopened.server.listen(Number(base.split(":").at(-1)), "127.0.0.1", r));
  t.after(() => {
    reopened.server.closeAllConnections();
    reopened.server.close();
  });
  const token2 = (await (await fetch(base + "/api/session")).json()).token;
  const p2 = async (path, data) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mark-Session": token2 },
      body: JSON.stringify(data),
    });
    return r.json();
  };
  // API keys persist across restarts (DPAPI-encrypted on Windows).
  const prefs = await (await fetch(base + "/api/settings")).json();
  assert.equal(prefs.keys.gemini, true);
  await p2("settings", { keyProvider: "gemini", apiKey: "MOCK-KEY" });
  await p2("models", { provider: "gemini" });
  for (let i = 0; i < 3; i++) await p2("produce", { id: e.id });
  assert.equal(calls, 3);
  saved = await store.read(e.id);
  for (const g of saved.groups) {
    await p2("review", { id: e.id, groupId: g.id, segments: "verified", approved: true });
    await p2("review", { id: e.id, groupId: g.id, approved: true });
  }
  offline = true;
  const a = await p2("attempt/start", { id: e.id });
  assert.ok(a.id);
  const q = saved.groups[0].questions[0];
  await p2("attempt/action", {
    id: e.id,
    attemptId: a.id,
    action: { type: "mark", questionId: q.id, index: q.answer },
  });
  const done = await p2("attempt/action", { id: e.id, attemptId: a.id, action: { type: "next" } });
  assert.equal(done.summary.correct, 1);
  assert.equal(done.summary.total, 2);
  const media = await fetch(base + saved.groups[0].segments[0].audio, { headers: { Range: "bytes=0-43" } });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 44);
});

test("a full 200-question fixture can finish both sections and archive an offline grade", async (t) => {
  const store = await setup(t);
  const counts = Object.fromEntries(
    Object.entries(EXAMS.toeic.parts).map(([part, spec]) => [part, spec.count]),
  );
  const episode = await store.create({ counts, title: "Full fixture" });
  episode.groups = episode.groups.map((group) =>
    group.part <= 4
      ? fixedGroup(group)
      : {
          ...group,
          status: "ready",
          segments: [],
          questions: Array.from({ length: group.count }, (_, index) => ({
            id: group.id + "-q" + index,
            section: "RC",
            choices: ["A", "B", "C", "D"],
            answer: 0,
          })),
        },
  );
  for (const group of episode.groups) {
    group.reviewed = true;
    for (const segment of group.segments) {
      await store.saveAudio(episode, segment, { wav: wav(), transcript: segment.text });
      segment.reviewed = true;
    }
  }
  await store.write(episode);
  const reopened = new EpisodeStore(store.root);
  const attempt = await reopened.begin(episode.id);
  assert.equal(attempt.durations.LC, 45 * 60_000);
  assert.equal(attempt.durations.RC, 75 * 60_000);
  for (const group of episode.groups.filter((g) => g.part <= 4)) {
    for (const q of group.questions)
      await reopened.attempt(episode.id, attempt.id, {
        type: "mark",
        phase: "LC",
        questionId: q.id,
        index: q.answer,
      });
  }
  assert.equal((await reopened.attempt(episode.id, attempt.id, { type: "next", phase: "LC" })).phase, "RC");
  assert.equal((await reopened.attempt(episode.id, attempt.id, { type: "next", phase: "LC" })).phase, "RC");
  for (const group of episode.groups.filter((g) => g.part > 4)) {
    for (const q of group.questions)
      await reopened.attempt(episode.id, attempt.id, {
        type: "mark",
        phase: "RC",
        questionId: q.id,
        index: q.answer,
      });
  }
  const done = await reopened.attempt(episode.id, attempt.id, { type: "next", phase: "RC" });
  assert.deepEqual([done.summary.correct, done.summary.total, done.summary.unsolved], [200, 200, 0]);
});
