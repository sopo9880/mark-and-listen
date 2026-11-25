// Prompt construction and strict parsing of AI-generated question groups, per exam hall.
import { LC_LAYOUT } from "../public/lib/toeic-fixed.mjs";
import { LETTERS, partsOf, sectionOf, isAudioGroup } from "../public/lib/exams.mjs";

const text = (v, n = 5000) => typeof v === "string" && v.trim().length > 0 && v.length <= n;
const illustrationFor = (g) =>
  g.part === 1 ? LC_LAYOUT.filter((x) => x.part === 1)[(Number(g.id.split("-")[1]) - 1) % 6] : null;

function toeicPrompt(g) {
  const image = illustrationFor(g);
  return [
    `Create original TOEIC-style Part ${g.part} material, exactly ${g.count} questions. JSON only, no tools.`,
    `Schema: {"passages":[{"title":"...","body":"..."}],"turns":[{"speaker":"A","text":"spoken text"}],"questions":[{"question":"...","choices":["..."],"answer":0,"explanation":"한국어 해설"}]}.`,
    `Each question has ${g.part === 2 ? 3 : 4} distinct choices, one zero-based answer, Korean explanation. Place the correct answer at a random index.`,
    g.part <= 4
      ? "Listening: turns contain ONLY conversation/announcement, not questions, options, answers. Part 3 has 3–10 alternating A/B turns (a third speaker C is allowed). Part 4 narrator turns. Part 1/2 turns empty. In every spoken text (turns, Part 1/2 choices, Part 2-4 questions) write numbers, prices, times, dates and percentages in words (e.g. 'nine thirty', 'fifteen dollars', 'the third floor') so narration can be checked word by word."
      : "Reading: turns empty.",
    g.part === 6
      ? "One coherent passage with exactly four blanks numbered [1] to [4], including sentence insertion."
      : g.part === 7
        ? `Exactly ${g.documents} complete related documents; questions answerable from them.`
        : g.part === 5
          ? "One _____ blank per question; no passages."
          : "No reading passages.",
    image
      ? `Use this supplied illustration: ${image.imageAlt}. Visible true fact: ${image.questions[0].choices[image.questions[0].answer]}`
      : "",
    "Each turn max 1100 characters.",
  ]
    .filter(Boolean)
    .join(" ");
}

function cbtPrompt(e, g, previous = []) {
  const subject = e.config.subjects[g.part - 1];
  const choices = e.config.choices;
  return [
    `Create exactly ${g.count} original multiple-choice questions for a Korean certification written exam (CBT).`,
    `Subject: ${JSON.stringify(subject.name)}.`,
    subject.topics
      ? `Focus topics: ${JSON.stringify(subject.topics)}.`
      : "Cover the core syllabus of this subject broadly.",
    `Difficulty: ${e.config.level} (기초 = fundamentals, 실전 = typical exam level, 심화 = harder than typical).`,
    "Write questions, choices and explanations in Korean. Technical terms may include English, units and formulas in plain text (no LaTeX, no images, no tables).",
    `Each question has exactly ${choices} distinct choices without numbering or labels, exactly one defensible correct answer (zero-based index, placed at a random position).`,
    "Use calculation questions where typical for the subject, with numbers that give a clean answer. Explanations are concise Korean and show the key concept, formula or steps.",
    "Do not reproduce real past exam items verbatim. Each question must be self-contained.",
    previous.length ? `Avoid repeating these earlier questions: ${JSON.stringify(previous.slice(-25))}.` : "",
    'JSON only, no tools: {"questions":[{"question":"...","choices":["..."],"answer":0,"explanation":"..."}]}',
  ]
    .filter(Boolean)
    .join(" ");
}

export function groupPrompt(e, g) {
  if (e.exam === "cbt") {
    const previous = e.groups
      .filter((x) => x.part === g.part && x.status === "ready")
      .flatMap((x) => x.questions.map((q) => q.question.slice(0, 80)));
    return cbtPrompt(e, g, previous);
  }
  return toeicPrompt(g);
}

function decode(raw) {
  try {
    return JSON.parse(
      String(raw)
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw Error("문항 JSON 형식 오류");
  }
}

function parseQuestions(d, e, g) {
  if (!Array.isArray(d.questions) || d.questions.length !== g.count) throw Error("문항 묶음 수 불일치");
  const choiceCount = partsOf(e)[g.part].choices;
  const section = sectionOf(e, g);
  const seen = new Set();
  return d.questions.map((q, i) => {
    if (
      !text(q?.question, 1500) ||
      !Array.isArray(q.choices) ||
      q.choices.length !== choiceCount ||
      q.choices.some((c) => !text(c, 600)) ||
      new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== q.choices.length ||
      !Number.isInteger(q.answer) ||
      q.answer < 0 ||
      q.answer >= q.choices.length ||
      !text(q.explanation, 2000) ||
      seen.has(q.question)
    )
      throw Error("문항 형식 또는 정답 오류");
    seen.add(q.question);
    if (e.exam === "toeic" && g.part === 5 && !q.question.includes("_____")) throw Error("Part 5 빈칸 누락");
    return {
      id: `${g.id}-q${i + 1}`,
      section,
      part: g.part,
      question: q.question.trim(),
      choices: q.choices.map((c) => c.trim()),
      answer: q.answer,
      explanation: q.explanation.trim(),
    };
  });
}

export function parseGroup(raw, g, e = { exam: "toeic" }) {
  const d = typeof raw === "string" ? decode(raw) : raw;
  const questions = parseQuestions(d, e, g);
  if (e.exam !== "toeic")
    return { ...g, status: "ready", reviewed: false, questions, passages: [], segments: [], error: null };

  const passages = (d.passages ?? []).map((p) => {
    if (!text(p.title, 200) || !text(p.body, 10000)) throw Error("지문 형식 오류");
    return { title: p.title, body: p.body };
  });
  if (g.documents && passages.length !== g.documents) throw Error("지문 묶음 수 불일치");
  if (g.part === 6 && ![1, 2, 3, 4].every((n) => passages[0].body.includes(`[${n}]`)))
    throw Error("Part 6 지문에 [1]~[4] 빈칸이 필요합니다.");
  let turns = d.turns ?? [];
  if (
    !Array.isArray(turns) ||
    turns.length > 30 ||
    turns.some((t) => !["A", "B", "C", "narrator"].includes(t.speaker) || !text(t.text, 1100))
  )
    throw Error("듣기 대본 형식 오류");
  if (g.part === 3 && (turns.length < 3 || new Set(turns.map((t) => t.speaker)).size < 2))
    throw Error("Part 3 화자 전환 누락");
  if (g.part === 4 && !turns.length) throw Error("Part 4 대본 누락");
  if (g.part <= 2) turns = [];
  if (isAudioGroup(e, g))
    questions.forEach((q) => {
      // Part 1/2: the prompt (Part 2) and all lettered choices form one segment, so one Live request covers a question.
      const choices = q.choices.map((c, i) => `${LETTERS[i]}. ${c}`).join("\n");
      if (g.part === 1) turns.push({ speaker: "narrator", text: choices });
      else if (g.part === 2) turns.push({ speaker: "narrator", text: `${q.question}\n${choices}` });
      else turns.push({ speaker: "narrator", text: q.question });
    });
  else turns = [];
  const image = illustrationFor(g);
  return {
    ...g,
    status: "ready",
    reviewed: false,
    questions,
    passages,
    segments: turns.map((t, i) => ({ ...t, id: `${g.id}-s${i + 1}`, status: "pending", reviewed: false })),
    ...(image ? { image: image.image, imageAlt: image.imageAlt } : {}),
    error: null,
  };
}

export function fixedGroup(g) {
  if (g.part > 4) throw Error("고정 검증 대본은 LC 전용입니다.");
  const original = LC_LAYOUT.filter((x) => x.part === g.part)[Number(g.id.split("-")[1]) - 1];
  if (!original) throw Error("고정 대본 없음");
  const questions = original.questions.map((q) => ({
    question: q.question,
    choices: q.choices,
    answer: q.answer,
    explanation: q.explanation,
  }));
  const turns = original.lines.map(([voice, text]) => ({ speaker: voice === "slt" ? "A" : "B", text }));
  return {
    ...parseGroup({ questions, turns, passages: [] }, g),
    ...(original.graphic ? { graphic: original.graphic, graphicAlt: original.graphicAlt } : {}),
  };
}
