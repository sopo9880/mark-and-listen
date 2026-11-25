// Exam hall registry shared by the local server and the browser UI.
// Raw scores only: no exam in this file claims an official scaled score.

export const LETTERS = ["A", "B", "C", "D", "E"];
export const SCHEMA = 2;

const toeicParts = {
  1: { section: "LC", count: 6, unit: 1, choices: 4, label: "사진 묘사" },
  2: { section: "LC", count: 25, unit: 1, choices: 3, label: "질의 응답" },
  3: { section: "LC", count: 39, unit: 3, choices: 4, label: "짧은 대화" },
  4: { section: "LC", count: 30, unit: 3, choices: 4, label: "짧은 담화" },
  5: { section: "RC", count: 30, unit: 1, choices: 4, label: "단문 빈칸 채우기" },
  6: { section: "RC", count: 16, unit: 4, choices: 4, label: "장문 빈칸 채우기" },
  7: { section: "RC", count: 54, unit: 1, choices: 4, label: "독해" },
};

export const EXAMS = {
  toeic: {
    id: "toeic",
    name: "TOEIC",
    hall: "TOEIC관",
    tagline: "Listening & Reading · Part 1–7",
    description: "LC 100 + RC 100 전체 회차부터 파트별 연습까지. Live 낭독 음원으로 실전처럼 듣습니다.",
    language: "en",
    sections: {
      LC: { label: "Listening", fullSeconds: 2700, fullCount: 100, audio: true },
      RC: { label: "Reading", fullSeconds: 4500, fullCount: 100, audio: false },
    },
    parts: toeicParts,
    requireReview: true,
  },
  cbt: {
    id: "cbt",
    name: "객관식 CBT",
    hall: "객관식 시험관",
    tagline: "기사·자격증 필기 · 과목 직접 구성",
    description:
      "과목과 문항 수를 정하면 AI가 한국어 객관식 회차를 만듭니다. 과목별 과락과 평균 합격 기준을 적용합니다.",
    language: "ko",
    sections: { CBT: { label: "필기", audio: false } },
    parts: null,
    requireReview: false,
  },
};

export const CBT_PRESETS = [
  {
    id: "mech-engineer",
    name: "일반기계기사 필기",
    minutes: 150,
    subjects: ["재료역학", "기계열역학", "기계유체역학", "기계재료 및 유압기기", "기계제도 및 기계설계"],
  },
  {
    id: "info-engineer",
    name: "정보처리기사 필기",
    minutes: 150,
    subjects: [
      "소프트웨어 설계",
      "소프트웨어 개발",
      "데이터베이스 구축",
      "프로그래밍 언어 활용",
      "정보시스템 구축관리",
    ],
  },
  { id: "custom", name: "직접 구성", minutes: 60, subjects: ["과목 1"] },
];

export const KTS_PASS = { subjectMin: 40, averageMin: 60 };
const GROUP_SIZE_CBT = 5;

export function examOf(episode) {
  const exam = EXAMS[episode?.exam];
  if (!exam) throw Error("지원하지 않는 시험관입니다.");
  return exam;
}

/** Per-part metadata for an episode: TOEIC parts are fixed, CBT parts are the episode's subjects. */
export function partsOf(episode) {
  const exam = examOf(episode);
  if (exam.parts) return exam.parts;
  const choices = episode.config?.choices ?? 4;
  return Object.fromEntries(
    (episode.config?.subjects ?? []).map((s, i) => [
      i + 1,
      { section: "CBT", count: s.count, unit: 1, choices, label: s.name },
    ]),
  );
}
export const partLabel = (episode, part) => {
  const p = partsOf(episode)[part];
  return episode.exam === "toeic" ? `Part ${part} · ${p?.label ?? ""}` : (p?.label ?? `과목 ${part}`);
};
export const sectionOf = (episode, group) => partsOf(episode)[group.part]?.section ?? "RC";
export const sectionIds = (episode) => Object.keys(examOf(episode).sections);
export const isAudioGroup = (episode, group) => !!examOf(episode).sections[sectionOf(episode, group)]?.audio;

export function blueprint(examId, counts) {
  const exam = EXAMS[examId];
  if (!exam || !exam.parts) throw Error("지원하지 않는 시험관입니다.");
  const result = [];
  for (const [key, raw] of Object.entries(counts ?? {})) {
    const part = Number(key),
      spec = exam.parts[part],
      n = Number(raw);
    if (!spec || !Number.isInteger(n) || n < 0 || n > spec.count || n % spec.unit || (part === 7 && n === 1))
      throw Error(
        "문항 수와 묶음 크기를 확인하세요. Part 3·4는 3개, Part 6은 4개 단위입니다. Part 7은 2개 이상입니다.",
      );
    let sizes = Array(n / spec.unit).fill(spec.unit);
    if (part === 7) {
      sizes = n === 54 ? [...Array(9).fill(3), 2, 5, 5, 5, 5, 5] : [];
      let left = n === 54 ? 0 : n;
      while (left) {
        const size = left <= 5 ? left : left === 6 ? 3 : 5;
        sizes.push(size);
        left -= size;
      }
    }
    sizes.forEach((count, i) =>
      result.push({
        id: `p${part}-${i + 1}`,
        part,
        count,
        documents:
          part === 7 ? (n === 54 ? (i < 10 ? 1 : i < 12 ? 2 : 3) : count >= 5 ? 2 : 1) : part === 6 ? 1 : 0,
        status: "pending",
      }),
    );
  }
  if (!result.length) throw Error("문항을 선택하세요.");
  return result;
}

const cleanText = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);

/** Validates a CBT configuration from the create form and returns a normalized copy. */
export function cbtConfig(input = {}) {
  const subjects = Array.isArray(input.subjects) ? input.subjects : [];
  if (!subjects.length || subjects.length > 8) throw Error("과목을 1~8개로 구성하세요.");
  const normalized = subjects.map((s, i) => {
    const name = cleanText(s?.name, 40);
    const count = Number(s?.count);
    if (!name) throw Error(`${i + 1}번째 과목 이름을 입력하세요.`);
    if (!Number.isInteger(count) || count < 1 || count > 60) throw Error(`${name}: 문항 수는 1~60개입니다.`);
    return { name, count, topics: cleanText(s?.topics, 300) };
  });
  const total = normalized.reduce((n, s) => n + s.count, 0);
  if (total > 200) throw Error("한 회차는 최대 200문항입니다.");
  const choices = Number(input.choices ?? 4);
  if (![4, 5].includes(choices)) throw Error("선택지는 4지 또는 5지입니다.");
  const minutes = Number(input.minutes ?? Math.round(total * 1.5));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) throw Error("시험 시간은 1~300분입니다.");
  const level = ["기초", "실전", "심화"].includes(input.level) ? input.level : "실전";
  const passRule = input.passRule === "none" ? null : KTS_PASS;
  return { subjects: normalized, choices, minutes, level, passRule };
}

export function cbtBlueprint(config) {
  const groups = [];
  config.subjects.forEach((subject, index) => {
    let left = subject.count,
      n = 0;
    while (left > 0) {
      const count = Math.min(GROUP_SIZE_CBT, left);
      groups.push({ id: `s${index + 1}-${++n}`, part: index + 1, count, documents: 0, status: "pending" });
      left -= count;
    }
  });
  return groups;
}

/** Brings episodes written by 0.1.x (schema 1) up to the current shape without losing attempts. */
export function migrateEpisode(e) {
  if (!e || e.kind !== "episode") return e;
  if ((e.schema ?? 1) < SCHEMA) {
    e.schema = SCHEMA;
    e.exam ??= "toeic";
  }
  e.config ??= {};
  e.attempts ??= [];
  for (const g of e.groups ?? []) {
    g.segments ??= [];
    for (const q of g.questions ?? []) q.section ??= sectionOf(e, g);
  }
  return e;
}

export function requiresReview(e) {
  return e.config?.requireReview ?? examOf(e).requireReview;
}

/** True when every question group and every required audio segment is generated (and reviewed when required). */
export function readyToTake(e) {
  const review = requiresReview(e);
  return (
    e.groups.length > 0 &&
    e.groups.every(
      (g) =>
        g.status === "ready" &&
        (!review || g.reviewed) &&
        (!isAudioGroup(e, g) ||
          (g.segments.length > 0 &&
            g.segments.every((s) => s.status === "ready" && s.reviewed && s.duration > 0))),
    )
  );
}
export const audioReady = readyToTake;

export function phaseDurations(e) {
  const exam = examOf(e);
  const counts = Object.fromEntries(sectionIds(e).map((id) => [id, 0]));
  for (const g of e.groups) counts[sectionOf(e, g)] += g.count;
  const out = {};
  for (const [id, section] of Object.entries(exam.sections)) {
    if (!counts[id]) out[id] = 0;
    else if (section.fullSeconds)
      out[id] = Math.ceil((section.fullSeconds * counts[id]) / section.fullCount) * 1000;
    else out[id] = (e.config?.minutes ?? Math.round(counts[id] * 1.5)) * 60000;
  }
  return out;
}

export function audioTimeline(e) {
  let at = 0;
  const list = [];
  for (const g of e.groups.filter((g) => isAudioGroup(e, g))) {
    for (const s of g.segments) {
      list.push({ ...s, groupId: g.id, start: at, end: at + s.duration });
      at += s.duration + 0.35;
    }
    at += g.count * 5;
  }
  return list;
}

export const questionsOf = (e) => e.groups.flatMap((g) => g.questions ?? []);

export function questionCounts(e) {
  const counts = {};
  for (const g of e.groups) counts[g.part] = (counts[g.part] ?? 0) + g.count;
  return counts;
}
