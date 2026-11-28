import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcriptDiff, verifiedNarration } from "../src/narration.mjs";
import { EpisodeStore, notebookEntries } from "../src/episode-store.mjs";
import { blueprint } from "../public/lib/exams.mjs";
import { parseGroup, groupPrompt, fixedGroup } from "../src/episode-content.mjs";
import { buildServer } from "../src/server.mjs";
import {
  cbtConfig,
  cbtBlueprint,
  phaseDurations,
  readyToTake,
  migrateEpisode,
  CBT_PRESETS,
} from "../public/lib/exams.mjs";
import { startAttempt, advanceAttempt, markAttempt } from "../public/lib/attempt.mjs";
import { scoreAttempt } from "../public/lib/scoring.mjs";

const exact = (a, b) => transcriptDiff(a, b).exact;

test("narration: choice labels may be missing or heard as homophones", () => {
  const choices =
    "A. The woman is arranging books.\nB. The window is closed.\nC. Three chairs are by the door.\nD. The table is not empty.";
  assert.ok(exact("C. Three chairs are by the door.", "See. Three chairs are by the door."));
  assert.ok(exact("B. A man is reading.", "Be a man is reading."));
  assert.ok(exact("A. A man is reading.", "A man is reading."));
  assert.ok(
    exact(
      choices,
      "A, the woman is arranging books. Be, the window is closed. See, three chairs are by the door. D, the table is not empty.",
    ),
  );
  const dropped = transcriptDiff(
    choices,
    "A, the woman is arranging books. B, the window is closed. D, the table is not empty.",
  );
  assert.equal(dropped.exact, false);
  assert.deepEqual(dropped.missing, ["3", "chairs", "are", "by", "the", "door"]);
  assert.equal(exact("A. The woman.\nB. The window.", "B, the window. A, the woman."), false);
});

test("narration: digits, money, percent, ordinals, years and times match their spoken forms", () => {
  for (const [script, heard] of [
    ["It costs $5.50.", "It costs five dollars and fifty cents."],
    ["at 9:30 a.m.", "at nine thirty AM"],
    ["at 9:00", "at nine o'clock"],
    ["in 2026", "in twenty twenty-six"],
    ["in 2026", "in two thousand twenty six"],
    ["the 21st floor", "the twenty-first floor"],
    ["50% off", "fifty percent off"],
    ["1,500 people", "one thousand five hundred people"],
    ["Room 305", "Room three oh five"],
    ["OK", "okay"],
    ["Send an e-mail", "Send an email"],
    ["It's ready", "It is ready"],
  ])
    assert.ok(exact(script, heard), `${script} ↔ ${heard}`);
  for (const [script, heard] of [
    ["ten fifteen", "ten fifty"],
    ["The meeting is not today.", "The meeting is today."],
    ["Hello", "Sure! Hello"],
    ["It costs $15.", "It costs fifty dollars."],
  ])
    assert.equal(exact(script, heard), false, `${script} ↔ ${heard}`);
});

test("narration mismatch keeps the last transcript and diff for review", async () => {
  let n = 0;
  const err = await verifiedNarration(
    async () => ({ transcript: "ten fifty", wav: Buffer.alloc(0), n: ++n }),
    {
      prompt: "ten fifteen",
    },
  ).catch((e) => e);
  assert.equal(err.code, "NARRATION_MISMATCH");
  assert.equal(n, 3);
  assert.equal(err.last.transcript, "ten fifty");
  assert.deepEqual(err.last.diff.ops.at(-1), { type: "changed", missing: ["15"], added: ["50"] });
});

test("CBT config validates subjects and blueprint chunks questions into groups of five", () => {
  assert.throws(() => cbtConfig({ subjects: [] }), /과목/);
  assert.throws(() => cbtConfig({ subjects: [{ name: "", count: 5 }] }), /이름/);
  assert.throws(() => cbtConfig({ subjects: [{ name: "a", count: 61 }] }), /1~60/);
  assert.throws(() => cbtConfig({ subjects: Array(5).fill({ name: "a", count: 41 }) }), /200/);
  const preset = CBT_PRESETS[0];
  const cfg = cbtConfig({
    subjects: preset.subjects.map((name) => ({ name, count: 20 })),
    minutes: preset.minutes,
  });
  assert.deepEqual(cfg.passRule, { subjectMin: 40, averageMin: 60 });
  const groups = cbtBlueprint(cfg);
  assert.equal(groups.length, 20);
  assert.equal(
    groups.reduce((n, g) => n + g.count, 0),
    100,
  );
  assert.deepEqual(
    cbtBlueprint(cbtConfig({ subjects: [{ name: "x", count: 7 }] })).map((g) => g.count),
    [5, 2],
  );
});

const cbtQuestions = (n, choices = 4) => ({
  questions: Array.from({ length: n }, (_, i) => ({
    question: `문항 ${i + 1}: 응력의 단위는?`,
    choices: ["Pa", "J", "W", "N·s", "kg"].slice(0, choices),
    answer: 0,
    explanation: "응력 = 힘/면적이므로 Pa입니다.",
  })),
});

test("CBT episode: generate, take without audio, grade with subject cut-off and average", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-cbt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await new EpisodeStore(root).init();
  const e = await store.create({
    exam: "cbt",
    title: "기계 필기",
    config: {
      subjects: [
        { name: "재료역학", count: 5 },
        { name: "열역학", count: 5 },
      ],
      minutes: 15,
    },
  });
  assert.equal(readyToTake(e), false);
  assert.match(groupPrompt(e, e.groups[0]), /재료역학/);
  for (const g of e.groups) Object.assign(g, parseGroup(JSON.stringify(cbtQuestions(g.count)), g, e));
  assert.throws(() => parseGroup(JSON.stringify(cbtQuestions(5, 5)), e.groups[0], e), /형식/);
  assert.match(groupPrompt(e, e.groups[0]), /Avoid repeating/);
  assert.equal(readyToTake(e), true, "CBT does not require manual review by default");
  assert.deepEqual(phaseDurations(e), { CBT: 15 * 60000 });
  await store.write(e);
  const a = await store.begin(e.id);
  await store.attempt(e.id, a.id, { type: "begin" });
  assert.equal(a.phase, "CBT");
  const qs = e.groups.flatMap((g) => g.questions);
  // Subject 1: all correct (100). Subject 2: one correct (20) → fails the 40-point cut-off.
  for (const q of qs.slice(0, 6))
    await store.attempt(e.id, a.id, { type: "mark", questionId: q.id, index: 0 });
  const done = await store.attempt(e.id, a.id, { type: "next" });
  assert.equal(done.phase, "done");
  assert.equal(done.summary.correct, 6);
  assert.equal(done.summary.byPart[1].percent, 100);
  assert.equal(done.summary.byPart[2].percent, 20);
  assert.equal(done.summary.pass.average, 60);
  assert.deepEqual(done.summary.pass.failed, [2]);
  assert.equal(done.summary.pass.passed, false);
  const notes = notebookEntries([await store.read(e.id)]);
  assert.equal(notes.length, 4);
  assert.equal(notes[0].mark, null);
});

test("schema 1 episodes from 0.1.x migrate without losing attempts or timing", () => {
  const legacy = {
    id: "old",
    kind: "episode",
    schema: 1,
    exam: "toeic",
    title: "old",
    createdAt: 1,
    groups: [
      {
        id: "p5-1",
        part: 5,
        count: 1,
        status: "ready",
        reviewed: true,
        segments: [],
        questions: [{ id: "q", choices: ["a", "b", "c", "d"], answer: 1, section: "RC" }],
      },
    ],
    attempts: [
      {
        id: "a",
        phase: "RC",
        phaseStartedAt: 0,
        phaseEndsAt: 10,
        durations: { LC: 0, RC: 10 },
        marks: { q: 1 },
        submittedAt: null,
      },
    ],
  };
  const e = migrateEpisode(structuredClone(legacy));
  assert.equal(e.schema, 2);
  assert.deepEqual(e.config, {});
  const done = advanceAttempt(e.attempts[0], 11);
  assert.equal(done.phase, "done");
  assert.equal(done.submittedAt, 10);
  assert.equal(scoreAttempt(e, done.marks).correct, 1);
  assert.equal(markAttempt(e.attempts[0], e, "q", 2, 5).marks.q, 2);
});

test("multi-section attempts skip empty sections and advance across all of them", () => {
  const e = {
    id: "x",
    exam: "toeic",
    config: {},
    groups: [{ id: "p5-1", part: 5, count: 2, status: "ready", reviewed: true, segments: [], questions: [] }],
  };
  const s = startAttempt(e, 0);
  assert.equal(s.phase, "RC");
  assert.equal(s.durations.LC, 0);
  assert.equal(advanceAttempt(s, s.phaseEndsAt).phase, "done");
});

test("server: rename, notebook mastery, delete and static UI modules", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-api2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const generate = async ({ prompt }) => {
    if (prompt.includes("independently checking")) return JSON.stringify({ answers: [0, 0, 0] });
    const n = Number(/exactly (\d+) original/.exec(prompt)[1]);
    return JSON.stringify(cbtQuestions(n));
  };
  const { server } = await buildServer({ root, updater, autoUpdate: false, codex: generate });
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
  assert.equal((await post("episodes", { exam: "cbt", config: { subjects: [] } })).status, 400);
  const { data: e } = await post("episodes", {
    exam: "cbt",
    title: "t",
    config: { subjects: [{ name: "유체역학", count: 3 }] },
  });
  let r;
  do r = await post("produce", { id: e.id });
  while (r.data.more);
  assert.equal(r.status, 200);
  assert.equal((await post("episodes/rename", { id: e.id, title: "  새 이름 " })).data.title, "새 이름");
  const a = (await post("attempt/start", { id: e.id })).data;
  await post("attempt/action", { id: e.id, attemptId: a.id, action: { type: "begin" } });
  assert.equal((await post("episodes/delete", { id: e.id })).status, 409, "open attempt blocks deletion");
  await post("attempt/action", { id: e.id, attemptId: a.id, action: { type: "next" } });
  const notes = await (await fetch(base + "/api/notebook")).json();
  assert.equal(notes.entries.length, 3);
  assert.equal((await post("notebook", { key: notes.entries[0].key, mastered: true })).status, 200);
  assert.equal((await post("notebook", { key: "../../etc", mastered: true })).status, 400);
  assert.equal(
    (await (await fetch(base + "/api/notebook")).json()).entries.filter((n) => n.mastered).length,
    1,
  );
  for (const path of ["/", "/app.mjs", "/styles.css", "/lib/exams.mjs", "/ui/dom.mjs", "/logo.png"])
    assert.equal((await fetch(base + path)).status, 200, path);
  for (const path of [
    "/../src/server.mjs",
    "/ui/../../src/server.mjs",
    "/lib/x.json",
    "/full-lc-images/a.mjs",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal((await post("episodes/delete", { id: e.id })).status, 200);
  assert.equal((await (await fetch(base + "/api/library")).json()).episodes.length, 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, "notebook.json"), "utf8")).mastered, {});
});

test("a damaged episode file does not hide the rest of the library", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-bad-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await new EpisodeStore(root).init();
  await store.create({ counts: { 5: 2 } });
  await writeFile(join(root, "broken.json"), "{not json");
  assert.equal((await store.list()).length, 1);
});

test("test mode joins the listening section into one WAV with the exam's pauses", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-listen-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { fixedGroup } = await import("../src/episode-content.mjs");
  const { wavFromPcm } = await import("../src/gemini-live.mjs");
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const { server, store } = await buildServer({ root, updater, autoUpdate: false, testMode: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const e = await store.create({ counts: { 2: 2 }, fixed: true });
  e.groups = e.groups.map(fixedGroup);
  for (const g of e.groups)
    for (const s of g.segments)
      await store.saveAudio(e, s, {
        wav: wavFromPcm([Buffer.alloc(4800, 1)], 4800, 24000),
        transcript: s.text,
      });
  await store.write(e);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/listening/${e.id}.wav`);
  assert.equal(res.status, 200);
  const wav = Buffer.from(await res.arrayBuffer());
  // Two Part 2 items, each a 0.1 s question + 0.6 s pause + 0.1 s responses; 5 s to answer between items.
  const expectedSamples = Math.round((0.1 + 0.6 + 0.1 + 5 + 0.1 + 0.6) * 24000) + 2400;
  assert.equal((wav.length - 44) / 2, expectedSamples);
  assert.equal(wav.readUInt32LE(24), 24000);
});

test("an attempt waits for the start button; skipping directions moves the audio, not the deadline", async () => {
  const { startAttempt, beginAttempt, skipAudio, audioPosition, advanceAttempt, markAttempt } =
    await import("../public/lib/attempt.mjs");
  const e = {
    id: "w",
    exam: "toeic",
    config: {},
    groups: [{ ...fixedGroup(blueprint("toeic", { 2: 1 })[0]), reviewed: true }],
  };
  e.groups[0].segments = e.groups[0].segments.map((s) => ({
    ...s,
    status: "ready",
    duration: 2,
    audio: "/x",
  }));
  const waiting = startAttempt(e, 1000, { waiting: true });
  assert.equal(waiting.waiting, true);
  assert.equal(advanceAttempt(waiting, 10 ** 12).phase, "LC", "the clock does not run before start");
  assert.equal(
    markAttempt(waiting, e, e.groups[0].questions[0].id, 0, 5000).marks[e.groups[0].questions[0].id],
    undefined,
  );
  const s = beginAttempt(waiting, 50_000);
  assert.equal(s.phaseEndsAt, 50_000 + s.durations.LC);
  const skipped = skipAudio(s, 12, 60_000);
  assert.equal(skipped.phaseEndsAt, s.phaseEndsAt);
  assert.equal(audioPosition(skipped, 60_000), 10 + 12);
});

test("Codex writes a weakness report for a finished attempt; it is saved and shown again without a new call", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-analysis-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const prompts = [];
  const report = {
    summary: "Part 5 품사 문제에서 실수가 많았습니다.",
    strengths: ["시제 문제"],
    weaknesses: [
      {
        area: "품사 자리",
        evidence: "1번에서 동사 원형을 골랐습니다.",
        tip: "빈칸 앞뒤 품사를 먼저 확인하세요.",
      },
    ],
    plan: [{ title: "품사 자리 20문항", detail: "be동사 뒤 분사 자리를 집중 연습", minutes: 20 }],
    nextFocus: "빈칸 앞뒤 품사 확인",
  };
  const codex = async ({ prompt, effort }) => {
    prompts.push({ prompt, effort });
    if (prompt.includes("study report")) return "```json\n" + JSON.stringify(report) + "\n```";
    if (prompt.includes("independently checking")) return JSON.stringify({ answers: [1] });
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
  const { server } = await buildServer({ root, updater, autoUpdate: false, codex });
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
  const { data: e } = await post("episodes", { exam: "toeic", counts: { 5: 1 } });
  let r;
  do r = await post("produce", { id: e.id });
  while (r.data.more);
  const a = (await post("attempt/start", { id: e.id })).data;
  assert.equal(
    (await post("attempt/analysis", { id: e.id, attemptId: a.id })).status,
    409,
    "not before grading",
  );
  await post("attempt/action", { id: e.id, attemptId: a.id, action: { type: "begin" } });
  const q = r.data.episode.groups[0].questions[0];
  await post("attempt/action", {
    id: e.id,
    attemptId: a.id,
    action: { type: "mark", questionId: q.id, index: 0 },
  });
  await post("attempt/action", { id: e.id, attemptId: a.id, action: { type: "next" } });
  const first = await post("attempt/analysis", { id: e.id, attemptId: a.id });
  assert.equal(first.status, 200);
  assert.equal(first.data.nextFocus, report.nextFocus);
  const asked = prompts.filter((p) => p.prompt.includes("study report"));
  assert.equal(asked.length, 1);
  assert.match(asked[0].prompt, /"picked":"A"/);
  assert.equal(asked[0].effort, "medium");
  await post("attempt/analysis", { id: e.id, attemptId: a.id });
  assert.equal(prompts.filter((p) => p.prompt.includes("study report")).length, 1, "saved report is reused");
  const lib = await (await fetch(base + "/api/library")).json();
  assert.equal(lib.episodes[0].attempts[0].analysis.weaknesses[0].area, "품사 자리");
});
