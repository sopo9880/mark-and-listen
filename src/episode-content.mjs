// Prompt construction and strict parsing of AI-generated question groups, per exam hall.
import { LC_LAYOUT } from "../public/lib/toeic-fixed.mjs";
import { validateDoc, docText, docSchemaHint, DOC_NAMES } from "../public/lib/docs.mjs";
import {
  LETTERS,
  partsOf,
  sectionOf,
  isAudioGroup,
  numberWords,
  firstNumberOf,
} from "../public/lib/exams.mjs";

const text = (v, n = 5000) => typeof v === "string" && v.trim().length > 0 && v.length <= n;
const illustrationFor = (g) =>
  g.part === 1 ? LC_LAYOUT.filter((x) => x.part === 1)[(Number(g.id.split("-")[1]) - 1) % 6] : null;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
// [document type, name used in "conversation and <name>"] — real-test graphic kinds.
const P3_GRAPHICS = [
  ["table", "price list"],
  ["table", "schedule"],
  ["table", "directory"],
  ["map", "floor plan"],
  ["map", "map"],
  ["coupon", "coupon"],
  ["chart", "graph"],
  ["label", "label"],
  ["invoice", "order form"],
];
const P4_KINDS = [
  "advertisement",
  "excerpt from a meeting",
  "talk",
  "announcement",
  "telephone message",
  "broadcast",
  "news report",
  "tour information",
  "introduction",
  "recorded message",
  "excerpt from a workshop",
];
const P4_GRAPHICS = [
  ["table", "schedule"],
  ["table", "program"],
  ["table", "agenda"],
  ["weather", "weather forecast"],
  ["map", "map"],
  ["chart", "graph"],
];

// Part 7 sets: suggested document types by number of documents (varied like the real test).
const P7_SINGLE = [
  "email",
  "notice",
  "article",
  "advertisement",
  "chat",
  "form",
  "webpage",
  "memo",
  "letter",
  "invoice",
  "review",
  "poster",
  "coupon",
  "menu",
  "ticket",
];
const P7_SETS = {
  2: [
    ["email", "form"],
    ["notice", "email"],
    ["advertisement", "review"],
    ["webpage", "email"],
    ["article", "letter"],
    ["email", "invoice"],
    ["table", "email"],
    ["memo", "chat"],
  ],
  3: [
    ["advertisement", "email", "review"],
    ["webpage", "email", "invoice"],
    ["notice", "table", "email"],
    ["article", "email", "letter"],
    ["email", "form", "chat"],
    ["poster", "email", "review"],
  ],
};
const P6_TYPES = ["email", "memo", "notice", "article", "letter", "advertisement", "webpage"];

/** Real-test layout of a Part 3/4 set by its position: 3 speakers, graphic sets, implied-meaning questions. */
export function setPlan(g) {
  const n = Number(String(g.id).split("-")[1]);
  if (g.part === 3)
    return {
      threeSpeakers: n === 6 || n === 9,
      graphic: n >= 11 ? pick(P3_GRAPHICS) : null,
      implied: n === 5 || n === 8,
      kind: n === 6 || n === 9 ? "conversation with three speakers" : "conversation",
    };
  if (g.part === 4) {
    const graphic = n >= 9 ? pick(P4_GRAPHICS) : null;
    return { threeSpeakers: false, graphic, implied: n === 2 || n === 3 || n === 5, kind: pick(P4_KINDS) };
  }
  return {};
}

function setRules(g) {
  if (g.part !== 3 && g.part !== 4) return "";
  const plan = setPlan(g);
  return [
    `Return "setType": a short lowercase phrase naming this set as in "Questions … refer to the following <setType>." Use "${plan.kind}${plan.graphic ? " and " + plan.graphic[1] : ""}".`,
    g.part === 3
      ? plan.threeSpeakers
        ? "Use exactly three speakers A, B and C (two of them the same gender is fine)."
        : "Use two speakers A and B, one man and one woman."
      : `One speaker (A) gives a ${plan.kind}.`,
    plan.graphic
      ? `This set has a graphic (a ${plan.graphic[1]}): return "graphic": ${docSchemaHint([plan.graphic[0]])}. Keep it short and readable at a glance (tables 3–7 rows, maps 2–4 rows × 2–4 columns). Exactly one question starts with "Look at the graphic." and can be answered only by combining the audio with the graphic.`
      : "",
    plan.implied
      ? 'One question asks what a speaker means/implies when he or she says "<exact short quote from the script>"; the quote must appear word for word in the turns.'
      : "",
    'Refer to speakers as "the man", "the woman", "the speaker" or by name, as in the real test.',
  ]
    .filter(Boolean)
    .join(" ");
}

function part7Types(g) {
  if (g.documents >= 2) return pick(P7_SETS[g.documents] ?? P7_SETS[3]);
  return [pick(P7_SINGLE)];
}

function toeicPrompt(g) {
  const image = illustrationFor(g);
  return [
    `Create original TOEIC-style Part ${g.part} material, exactly ${g.count} questions. JSON only, no tools.`,
    `Schema: {"passages":[typed documents, Part 6/7 only],"turns":[{"speaker":"A","text":"spoken text"}],"questions":[{"question":"...","choices":["..."],"answer":0,"explanation":"한국어 해설"}]${g.part === 3 || g.part === 4 ? ',"setType":"..."' : ""}}.`,
    `Each question has ${g.part === 2 ? 3 : 4} distinct choices, one zero-based answer, Korean explanation. Place the correct answer at a random index.`,
    g.part <= 4
      ? "Listening: turns contain ONLY conversation/announcement, not questions, options, answers. Part 3 has 3–10 alternating A/B turns (a third speaker C is allowed). Part 4 narrator turns. Part 1/2 turns empty. In every spoken text (turns, Part 1/2 choices, Part 2-4 questions) write numbers, prices, times, dates and percentages in words (e.g. 'nine thirty', 'fifteen dollars', 'the third floor') so narration can be checked word by word."
      : "Reading: turns empty.",
    setRules(g),
    g.part === 6
      ? `"passages" holds exactly one typed document, ${docSchemaHint([pick(P6_TYPES)])}, whose body has exactly four blanks numbered [1] to [4] (one of them a sentence-insertion blank).`
      : g.part === 7
        ? `"passages" holds exactly ${g.documents} complete related typed documents in this order: ${part7Types(
            g,
          )
            .map((t) => docSchemaHint([t]))
            .join(
              " , then ",
            )}. Questions are answerable only from them${g.documents > 1 ? "; at least one question needs two documents" : ""}. For a text-message chain, one question may ask what a writer means by an exact short quote from it.`
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
    if (p && typeof p === "object" && typeof p.type === "string") {
      const doc = validateDoc(p);
      return { title: DOC_NAMES[doc.type], body: docText(doc), doc };
    }
    if (!text(p?.title, 200) || !text(p?.body, 10000)) throw Error("지문 형식 오류");
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
  let extra = {};
  if (g.part === 3 || g.part === 4) extra = setExtras(d, g, turns, questions);
  if (g.part <= 2) turns = [];
  if (g.part === 4) turns = turns.map((t) => ({ ...t, speaker: "A" })); // one talker; the narrator reads intro and questions
  turns = turns.map((t) => ({ ...t, role: "turn" }));
  if (isAudioGroup(e, g)) {
    // Real-test voices: Part 1 statements by one speaker; Part 2 question by one speaker and the responses by
    // another; Part 3–4 set introduction and "Number N. <question>" by the fixed narrator.
    const first = firstNumberOf(e, g);
    if (g.part >= 3)
      turns.unshift({
        speaker: "narrator",
        role: "intro",
        text: `Questions ${numberWords(first)} through ${numberWords(first + g.count - 1)} refer to the following ${extra.setType ?? (g.part === 3 ? "conversation" : "talk")}.`,
      });
    questions.forEach((q, i) => {
      const choices = q.choices.map((c, k) => `${LETTERS[k]}. ${c}`).join("\n");
      if (g.part === 1) turns.push({ speaker: "A", role: "choices", q: i, text: choices });
      else if (g.part === 2) {
        turns.push({ speaker: "A", role: "prompt", q: i, text: q.question });
        turns.push({ speaker: "B", role: "choices", q: i, text: choices });
      } else
        turns.push({
          speaker: "narrator",
          role: "question",
          q: i,
          text: `Number ${numberWords(first + i)}. ${q.question}`,
        });
    });
  } else turns = [];
  delete extra.setType;
  const image = illustrationFor(g);
  return {
    ...g,
    status: "ready",
    reviewed: false,
    questions,
    passages,
    segments: turns.map((t, i) => ({ ...t, id: `${g.id}-s${i + 1}`, status: "pending", reviewed: false })),
    ...(image ? { image: image.image, imageAlt: image.imageAlt } : {}),
    ...extra,
    error: null,
  };
}

function setExtras(d, g, turns, questions) {
  const out = {};
  if (d.setType !== undefined) {
    const t = String(d.setType).trim().toLowerCase().replace(/[.]$/, "");
    if (!/^[a-z][a-z ,'-]{2,70}$/.test(t)) throw Error("세트 유형 형식 오류");
    out.setType = t;
  }
  const spoken = turns
    .map((t) => t.text)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ");
  for (const q of questions) {
    const quote = q.question.match(/["“]([^"”]{3,120})["”]/);
    if (!quote) continue;
    const said = quote[1]
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!spoken.includes(said)) throw Error("인용 표현이 대본에 없습니다.");
  }
  if (d.graphic !== undefined && d.graphic !== null) {
    const gr = d.graphic;
    // Older answers send a bare table {title, rows}.
    const doc = validateDoc(gr && !gr.type && Array.isArray(gr.rows) ? { type: "table", ...gr } : gr);
    if (!questions.some((q) => /look at the graphic/i.test(q.question))) throw Error("그래픽 문항 누락");
    out.doc = doc;
  }
  return out;
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
