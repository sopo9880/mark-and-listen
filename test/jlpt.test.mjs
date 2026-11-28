import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  jlptBlueprint,
  firstNumberOf,
  phaseDurations,
  audioTimeline,
  partsOf,
  examOf,
  readyToTake,
} from "../public/lib/exams.mjs";
import { jlptMondai, jlptEstimate, rubyParts, plainJa, JLPT_GAPS } from "../public/lib/jlpt.mjs";
import { parseJlptGroup, jlptPrompt, jlptSolvePrompt } from "../src/jlpt-content.mjs";
import {
  startAttempt,
  advanceAttempt,
  finishPhase,
  beginAttempt,
  markAttempt,
} from "../public/lib/attempt.mjs";
import { scoreAttempt } from "../public/lib/scoring.mjs";
import { transcriptDiff } from "../src/narration.mjs";
import { plausibleDuration } from "../src/stt.mjs";
import { PhotoLibrary } from "../src/photo-library.mjs";
import { buildServer, voiceFor } from "../src/server.mjs";
import { wavFromPcm } from "../src/gemini-live.mjs";

const episode = (level, parts = null) => ({
  id: "00000000-0000-4000-8000-000000000000",
  exam: "jlpt",
  config: { level },
  groups: jlptBlueprint(level, parts),
  attempts: [],
});
const partOf = (level, kind) => jlptMondai(level).find((m) => m.kind === kind).part;
const wavOf = (seconds, rate = 24000) => {
  const n = Math.round(seconds * rate);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 7)), i * 2);
  return wavFromPcm([pcm], pcm.length, rate);
};

test("every level follows its published layout: sections, times, 問題 order and numbering", () => {
  const n1 = episode("N1");
  assert.deepEqual(Object.keys(examOf(n1).sections), ["LK", "L"]);
  assert.deepEqual(phaseDurations(n1), { LK: 110 * 60000, L: 55 * 60000 });
  const n5 = episode("N5");
  assert.deepEqual(Object.keys(examOf(n5).sections), ["V", "G", "L"]);
  assert.deepEqual(phaseDurations(n5), { V: 20 * 60000, G: 40 * 60000, L: 30 * 60000 });
  // Paper sections count on; every listening 問題 starts again at 1番.
  const g = (kind, n = 1) => n5.groups.find((x) => x.kind === kind && x.id.endsWith(`-${n}`));
  assert.equal(firstNumberOf(n5, g("kanji-reading")), 1);
  assert.equal(firstNumberOf(n5, g("orthography")), 8);
  assert.equal(firstNumberOf(n5, g("grammar-form")), 1, "文法・読解 is its own booklet");
  assert.equal(firstNumberOf(n5, g("task")), 1);
  assert.equal(firstNumberOf(n5, g("task", 2)), 4);
  assert.equal(firstNumberOf(n5, g("point")), 1);
  // N2 only: 語形成; N3–N5 only: 発話表現.
  assert.ok(jlptMondai("N2").some((m) => m.kind === "word-formation"));
  assert.ok(!jlptMondai("N1").some((m) => m.kind === "utterance"));
  assert.ok(jlptMondai("N4").some((m) => m.kind === "utterance"));
  // Picture items: N5 課題理解 uses picture choices, 発話表現 one scene per item.
  assert.equal(
    n5.groups.filter((x) => x.kind === "task").reduce((n, x) => n + x.pictureItems, 0),
    7,
  );
  assert.equal(g("utterance").pictureKind, "scene");
  assert.equal(g("utterance").pictureItems, 5);
});

test("readings and underlined targets are markup; spoken text never carries it", () => {
  assert.deepEqual(rubyParts("{漢字|かんじ}を__読む__。"), [
    { base: "漢字", ruby: "かんじ" },
    { text: "を" },
    { under: "読む" },
    { text: "。" },
  ]);
  assert.equal(plainJa("{漢字|かんじ}を__読む__"), "漢字を読む");
});

test("listening groups become N番 items with directions, real-test order and pauses", () => {
  const e = episode("N5", [partOf("N5", "task"), partOf("N5", "point"), partOf("N5", "quick")]);
  const task = e.groups[0];
  const pics = [
    { item: 0, sha256: "a".repeat(64), kind: "grid" },
    { item: 1, sha256: "b".repeat(64), kind: "grid" },
    { item: 2, sha256: "c".repeat(64), kind: "grid" },
  ];
  assert.match(jlptPrompt(e, task, pics), /attached image 1: four pictures numbered 1–4/);
  const item = (i) => ({
    situation: "教室で男の人と女の人が話しています。",
    question: "女の人はこのあと何をしますか。",
    turns: [
      { speaker: "M", text: "すみません、窓を開けてください。" },
      { speaker: "F", text: "はい、わかりました。" },
    ],
    choices: ["まどをあける", "ドアをしめる", "でんきをけす", "いすをならべる"],
    answer: i % 4,
    explanation: "여자는 창문을 엽니다.",
  });
  const parsed = parseJlptGroup({ items: [item(0), item(1), item(2)] }, task, e, pics);
  assert.equal(parsed.segments[0].role, "directions");
  assert.match(parsed.segments[0].text, /^問題1。/);
  assert.equal(
    parsed.segments[1].text,
    "1番。教室で男の人と女の人が話しています。女の人はこのあと何をしますか。",
  );
  assert.deepEqual(
    parsed.segments.slice(1, 6).map((s) => s.role),
    ["prompt", "turn", "turn", "question", "prompt"],
  );
  assert.equal(parsed.questions[1].image.sha256, "b".repeat(64));
  assert.match(jlptSolvePrompt(e, parsed), /M: すみません、窓を開けてください。/);
  // Gender words must match the voices.
  assert.throws(
    () =>
      parseJlptGroup(
        {
          items: [
            {
              ...item(0),
              turns: [
                { speaker: "F", text: "あ" },
                { speaker: "F2", text: "い" },
              ],
            },
            item(1),
            item(2),
          ],
        },
        task,
        e,
      ),
    /성별/,
  );

  const quickGroup = e.groups.find((g) => g.kind === "quick");
  const quick = parseJlptGroup(
    {
      items: Array.from({ length: quickGroup.count }, (_, i) => ({
        line: { speaker: "F", text: `お元気ですか。${i}` },
        choices: ["はい、元気です。", "いいえ、どうぞ。", "では、また。"],
        answer: 0,
        explanation: "안부 인사",
      })),
    },
    quickGroup,
    e,
  );
  assert.deepEqual(
    quick.segments.slice(1, 4).map((s) => [s.role, s.speaker]),
    [
      ["prompt", "narrator"],
      ["line", "F"],
      ["choices", "M"],
    ],
  );
  assert.equal(quick.segments[3].text, "1. はい、元気です。\n2. いいえ、どうぞ。\n3. では、また。");
  // Voices: F/M keep their gender whatever the group order.
  assert.ok(
    ["Kore", "Aoede", "Leda", "Zephyr"].includes(voiceFor("gemini", e, quickGroup, { speaker: "F" })),
  );
  assert.ok(
    ["Puck", "Iapetus", "Orus", "Fenrir"].includes(voiceFor("gemini", e, quickGroup, { speaker: "M" })),
  );

  // Timeline: ポイント理解 leaves reading time after the question; answers get answer time.
  const pointGroup = e.groups.find((g) => g.kind === "point");
  Object.assign(pointGroup, parseJlptGroup({ items: [item(0), item(1), item(2)] }, pointGroup, e));
  for (const s of pointGroup.segments) s.duration = 2;
  e.groups = [pointGroup];
  const tl = audioTimeline(e);
  const prompt = tl.find((x) => x.role === "prompt");
  assert.equal(tl[tl.indexOf(prompt) + 1].start - prompt.end, JLPT_GAPS.read);
  const asked = tl.find((x) => x.role === "question");
  assert.equal(tl[tl.indexOf(asked) + 1].start - asked.end, JLPT_GAPS.answer);
});

test("paper 問題 need their markers; text grammar needs numbered blanks", () => {
  const e = episode("N3", [partOf("N3", "kanji-reading"), partOf("N3", "text-grammar")]);
  const [kanji, text] = e.groups;
  const q = (question, answer = 0) => ({
    question,
    choices: ["かいぎ", "かいき", "がいぎ", "かいぎい"],
    answer,
    explanation: "회의",
  });
  const many = (fn) => Array.from({ length: kanji.count }, (_, i) => fn(i));
  assert.throws(
    () => parseJlptGroup({ questions: many((i) => q(`明日は会議があります。${i}`)) }, kanji, e),
    /밑줄/,
  );
  const ok = parseJlptGroup({ questions: many((i) => q(`明日は__会議__があります。${i}`)) }, kanji, e);
  assert.equal(ok.questions[0].section, "V");
  assert.match(jlptSolvePrompt(e, ok), /__会議__/);
  const blanks = (n) => Array.from({ length: n }, (_, k) => `［${k + 1}］`).join("、");
  const tq = Array.from({ length: text.count }, (_, i) => ({
    ...q(`［${i + 1}］`),
    choices: ["が", "を", "に", "で"],
  }));
  assert.throws(
    () =>
      parseJlptGroup({ passages: [{ title: "作文", body: blanks(text.count - 1) }], questions: tq }, text, e),
    /빈칸/,
  );
  assert.equal(
    parseJlptGroup({ passages: [{ title: "作文", body: blanks(text.count) }], questions: tq }, text, e)
      .passages.length,
    1,
  );
});

test("estimated JLPT score: sectional minimums and the pass mark", () => {
  const n3 = jlptBlueprint("N3");
  const parts = partsOf({ exam: "jlpt", config: { level: "N3" } });
  const rows = (score) =>
    n3.flatMap((g) =>
      Array.from({ length: g.count }, () => ({ part: g.part, correct: score(parts[g.part].score) })),
    );
  const all = jlptEstimate(
    "N3",
    rows(() => true),
    parts,
  );
  assert.equal(all.total, 180);
  assert.equal(all.passed, true);
  const noListening = jlptEstimate(
    "N3",
    rows((s) => s !== "listen"),
    parts,
  );
  assert.equal(noListening.total, 120, "120 ≥ 95 but listening is below its minimum");
  assert.equal(noListening.passed, false);
  assert.deepEqual(noListening.failed, ["listen"]);
  const n5 = jlptEstimate(
    "N5",
    rows(() => true).slice(0, 3),
    partsOf({ exam: "jlpt", config: { level: "N5" } }),
  );
  assert.equal(n5.sections.langread.max, 120);
  assert.equal(n5.complete, false);
  assert.equal(n5.passed, null);
});

test("the listening section waits for its own start after the paper sections", () => {
  const e = episode("N5", [1, partOf("N5", "quick")]);
  for (const g of e.groups) {
    g.status = "ready";
    g.questions = Array.from({ length: g.count }, (_, i) => ({
      id: `${g.id}-q${i + 1}`,
      section: g.kind === "quick" ? "L" : "V",
      part: g.part,
      question: "x",
      choices: ["1", "2", "3", "4"].slice(0, g.kind === "quick" ? 3 : 4),
      answer: 0,
      explanation: "x",
    }));
    g.segments = g.kind === "quick" ? [{ id: "s", role: "prompt", status: "ready", duration: 1 }] : [];
  }
  assert.ok(readyToTake(e));
  let s = beginAttempt(startAttempt(e, 0, { waiting: true }), 1000);
  assert.equal(s.phase, "V");
  s = finishPhase(s, 5000);
  assert.equal(s.phase, "L");
  assert.equal(s.waiting, true);
  assert.equal(advanceAttempt(s, 10 ** 12).phase, "L", "no clock until 듣기 시작");
  assert.equal(
    markAttempt(s, e, e.groups[1].questions[0].id, 0, 6000).marks[e.groups[1].questions[0].id],
    undefined,
  );
  s = beginAttempt(s, 9000);
  assert.equal(s.startedAt, 1000);
  assert.equal(s.phaseEndsAt, 9000 + s.durations.L);
  const r = scoreAttempt(e, { [e.groups[0].questions[0].id]: 0 });
  assert.equal(r.jlpt.level, "N5");
});

test("Japanese narration: kana/kanji and item numbers tolerated, changed negation is not", () => {
  assert.equal(transcriptDiff("3番。男の人が話しています。", "さんばん。男の人が話しています。").exact, true);
  assert.equal(transcriptDiff("明日は行きません。", "明日は行きます。").exact, false);
  assert.equal(
    transcriptDiff("1. はい。\n2. いいえ。\n3. どうぞ。", "いち、はい。に、いいえ。さん、どうぞ。").exact,
    true,
  );
  assert.equal(transcriptDiff("駅の前で待っています。", "すみません、今日は雨です。").exact, false);
  assert.equal(plausibleDuration("駅の前で待っています。", 2).ok, true);
  assert.equal(plausibleDuration("駅の前で待っています。", 0.2).ok, false);
});

test("bundled JLPT illustrations: 200 pictures, distinct sets per episode", async () => {
  const lib = new PhotoLibrary(fileURLToPath(new URL("../assets/jlpt-images/", import.meta.url)));
  const list = await lib.list();
  assert.equal(list.length, 200);
  assert.equal(list.filter((p) => p.kind === "grid").length, 78);
  const grids = await lib.pick(12, new Map(), Math.random, [], "grid");
  assert.equal(new Set(grids.map((p) => p.name)).size, 12, "never two versions of one picture set");
  const scenes = await lib.pick(5, new Map(), Math.random, grids, "scene");
  assert.ok(scenes.every((p) => p.kind === "scene"));
  assert.equal((await lib.read(scenes[0].sha256)).subarray(0, 2).toString("hex"), "ffd8");
});

test("a JLPT episode is made end to end: pictures attached to Codex, solver check, Japanese narration", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ml-jlpt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const calls = [];
  const codex = async ({ prompt, images }) => {
    calls.push({ prompt, images: images?.length ?? 0 });
    if (prompt.includes("independently checking")) {
      const n = (prompt.match(/^\d+\. /gm) ?? []).length;
      return JSON.stringify({ answers: Array(n).fill(1) });
    }
    if (prompt.includes("「発話表現」"))
      return JSON.stringify({
        items: Array.from({ length: 5 }, (_, i) => ({
          situation: `お店で店員を呼びたいです。${i}`,
          question: "何と言いますか。",
          speaker: "M",
          choices: ["すみません。", "いただきます。", "おやすみなさい。"],
          answer: 1,
          explanation: "점원을 부를 때",
        })),
      });
    return JSON.stringify({
      questions: Array.from({ length: 7 }, (_, i) => ({
        question: `毎朝__七時__に起きます。${i}`,
        choices: ["しちじ", "ななじ", "しじ", "ななとき"],
        answer: 1,
        explanation: "일곱 시",
      })),
    });
  };
  const spoken = [];
  const live = async ({ prompt, voice }) => {
    spoken.push({ prompt, voice });
    return { wav: wavOf(Math.max(0.6, prompt.length / 7)), transcript: prompt };
  };
  const { server, store } = await buildServer({
    root,
    updater,
    autoUpdate: false,
    codex,
    live,
    models: async () => [{ id: "gemini-mock-live" }],
  });
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
  await post("settings", {
    keyProvider: "gemini",
    apiKey: "MOCK-KEY",
    liveProvider: "gemini",
    liveModel: "gemini-mock-live",
  });
  await post("models", { provider: "gemini" });
  assert.equal((await post("episodes", { exam: "jlpt", config: { level: "N9" } })).status, 400);
  const { data: e } = await post("episodes", {
    exam: "jlpt",
    title: "N5 연습",
    config: { level: "N5", parts: [1, partOf("N5", "utterance")] },
  });
  assert.equal(e.groups[1].pictures.length, 5);
  let r,
    guard = 0;
  do r = await post("produce", { id: e.id });
  while (r.data.more && ++guard < 80);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const done = await store.read(e.id);
  assert.ok(readyToTake(done), "every group verified and every segment narrated");
  const make = calls.find((c) => c.prompt.includes("「発話表現」"));
  assert.equal(make.images, 5, "the scenes are attached to the Codex call");
  assert.equal(calls.find((c) => c.prompt.includes("「漢字読み」")).images, 0);
  assert.ok(
    spoken.some((s) => s.prompt.startsWith("問題3。")),
    "spoken 問題 directions",
  );
  assert.ok(
    spoken.some(
      (s) =>
        s.prompt === "1. すみません。\n2. いただきます。\n3. おやすみなさい。" &&
        ["Puck", "Iapetus", "Orus", "Fenrir"].includes(s.voice),
    ),
  );
  const q = done.groups[1].questions[0];
  const img = await fetch(`${base}/api/jlpt-image/${e.id}/${q.id}`);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.equal((await fetch(`${base}/api/jlpt-image/${e.id}/${done.groups[0].questions[0].id}`)).status, 404);
});
