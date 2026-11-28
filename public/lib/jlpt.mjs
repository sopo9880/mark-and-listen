// JLPT exam hall (N1–N5): sections, question types (問題), group layout, listening order and estimated scoring.
// Question counts follow the published test structure as closely as public material allows; scores are an
// estimate from raw answers (the real test uses equated scaled scores), so the app always labels them "추정".

export const JLPT_LEVELS = ["N1", "N2", "N3", "N4", "N5"];

/**
 * Question types. section: V (文字・語彙), G (文法・読解), LK (言語知識・読解, N1/N2), L (聴解).
 * score: lang | read | listen. per: questions per group (reading: one passage per group).
 * print (listening): what the test paper shows — text choices, picture choices (grid), a scene, or nothing.
 */
export const JLPT_KINDS = {
  "kanji-reading": { ja: "漢字読み", ko: "한자 읽기", score: "lang" },
  orthography: { ja: "表記", ko: "표기", score: "lang" },
  "word-formation": { ja: "語形成", ko: "단어 형성", score: "lang" },
  context: { ja: "文脈規定", ko: "문맥 규정", score: "lang" },
  paraphrase: { ja: "言い換え類義", ko: "유의 표현", score: "lang" },
  usage: { ja: "用法", ko: "용법", score: "lang" },
  "grammar-form": { ja: "文の文法1（文法形式の判断）", ko: "문법 형식 판단", score: "lang" },
  "sentence-order": { ja: "文の文法2（文の組み立て）", ko: "문장 만들기 (★)", score: "lang" },
  "text-grammar": { ja: "文章の文法", ko: "글의 문법", score: "lang", docs: 1 },
  "short-reading": { ja: "内容理解（短文）", ko: "내용 이해 (단문)", score: "read", docs: 1, per: 1 },
  "mid-reading": { ja: "内容理解（中文）", ko: "내용 이해 (중문)", score: "read", docs: 1, per: 3 },
  "long-reading": { ja: "内容理解（長文）", ko: "내용 이해 (장문)", score: "read", docs: 1 },
  "integrated-reading": { ja: "統合理解", ko: "통합 이해", score: "read", docs: 2 },
  "thematic-reading": { ja: "主張理解（長文）", ko: "주장 이해 (장문)", score: "read", docs: 1 },
  "info-retrieval": { ja: "情報検索", ko: "정보 검색", score: "read", docs: 1 },
  task: { ja: "課題理解", ko: "과제 이해", score: "listen", per: 3, print: "text" },
  point: { ja: "ポイント理解", ko: "포인트 이해", score: "listen", per: 3, print: "text" },
  summary: { ja: "概要理解", ko: "개요 이해", score: "listen", per: 3, print: "none" },
  utterance: { ja: "発話表現", ko: "발화 표현", score: "listen", per: 5, print: "scene", choices: 3 },
  quick: { ja: "即時応答", ko: "즉시 응답", score: "listen", per: 6, print: "none", choices: 3 },
  "integrated-listening": { ja: "統合理解", ko: "통합 이해", score: "listen", per: 2, print: "text" },
};

const L = (kind, count, extra = {}) => ({ kind, count, ...extra });

/** Per level: timed sections (minutes) and the 問題 in paper order. */
export const JLPT_SPEC = {
  N1: {
    sections: { LK: 110, L: 55 },
    mondai: {
      LK: [
        L("kanji-reading", 6),
        L("context", 7),
        L("paraphrase", 6),
        L("usage", 6),
        L("grammar-form", 10),
        L("sentence-order", 5),
        L("text-grammar", 5),
        L("short-reading", 4),
        L("mid-reading", 9),
        L("long-reading", 4),
        L("integrated-reading", 2),
        L("thematic-reading", 3),
        L("info-retrieval", 2),
      ],
      L: [L("task", 5), L("point", 6), L("summary", 5), L("quick", 11), L("integrated-listening", 3)],
    },
    pass: { total: 100, min: { lang: 19, read: 19, listen: 19 } },
  },
  N2: {
    sections: { LK: 105, L: 50 },
    mondai: {
      LK: [
        L("kanji-reading", 5),
        L("orthography", 5),
        L("word-formation", 3),
        L("context", 7),
        L("paraphrase", 5),
        L("usage", 5),
        L("grammar-form", 12),
        L("sentence-order", 5),
        L("text-grammar", 5),
        L("short-reading", 5),
        L("mid-reading", 9),
        L("integrated-reading", 2),
        L("thematic-reading", 3),
        L("info-retrieval", 2),
      ],
      L: [L("task", 5), L("point", 6), L("summary", 5), L("quick", 12), L("integrated-listening", 4)],
    },
    pass: { total: 90, min: { lang: 19, read: 19, listen: 19 } },
  },
  N3: {
    sections: { V: 30, G: 70, L: 40 },
    mondai: {
      V: [L("kanji-reading", 8), L("orthography", 6), L("context", 11), L("paraphrase", 5), L("usage", 5)],
      G: [
        L("grammar-form", 13),
        L("sentence-order", 5),
        L("text-grammar", 5),
        L("short-reading", 4),
        L("mid-reading", 6),
        L("long-reading", 4),
        L("info-retrieval", 2),
      ],
      L: [L("task", 6, { pictures: 2 }), L("point", 6), L("summary", 3), L("utterance", 4), L("quick", 9)],
    },
    pass: { total: 95, min: { lang: 19, read: 19, listen: 19 } },
  },
  N4: {
    sections: { V: 25, G: 55, L: 35 },
    mondai: {
      V: [L("kanji-reading", 7), L("orthography", 5), L("context", 8), L("paraphrase", 4), L("usage", 4)],
      G: [
        L("grammar-form", 13),
        L("sentence-order", 4),
        L("text-grammar", 4),
        L("short-reading", 3),
        L("mid-reading", 3),
        L("info-retrieval", 2),
      ],
      L: [L("task", 8, { pictures: 8 }), L("point", 7, { pictures: 2 }), L("utterance", 5), L("quick", 8)],
    },
    pass: { total: 90, min: { langread: 38, listen: 19 } },
  },
  N5: {
    sections: { V: 20, G: 40, L: 30 },
    mondai: {
      V: [L("kanji-reading", 7), L("orthography", 5), L("context", 6), L("paraphrase", 3)],
      G: [
        L("grammar-form", 9),
        L("sentence-order", 4),
        L("text-grammar", 4),
        L("short-reading", 2),
        L("mid-reading", 2, { per: 2 }),
        L("info-retrieval", 1),
      ],
      L: [L("task", 7, { pictures: 7 }), L("point", 6, { pictures: 2 }), L("utterance", 5), L("quick", 6)],
    },
    pass: { total: 80, min: { langread: 38, listen: 19 } },
  },
};

export const JLPT_SECTION_LABEL = {
  LK: "言語知識（文字・語彙・文法）・読解",
  V: "言語知識（文字・語彙）",
  G: "言語知識（文法）・読解",
  L: "聴解",
};

/** All 問題 of a level, numbered 1…n across sections (the episode's "parts"). */
export function jlptMondai(level) {
  const spec = JLPT_SPEC[level];
  if (!spec) throw Error("JLPT 레벨을 선택하세요.");
  const out = [];
  for (const [section, list] of Object.entries(spec.mondai))
    list.forEach((m, i) => {
      const kind = JLPT_KINDS[m.kind];
      out.push({
        ...m,
        part: out.length + 1,
        section,
        no: i + 1,
        choices: kind.choices ?? 4,
        per: m.per ?? kind.per ?? m.count,
        docs: kind.docs ?? 0,
        print: kind.print ?? null,
        score: kind.score,
        label: `問題${i + 1} ${kind.ja}`,
        ko: kind.ko,
      });
    });
  return out;
}

export function jlptParts(level) {
  return Object.fromEntries(
    jlptMondai(level).map((m) => [
      m.part,
      {
        section: m.section,
        count: m.count,
        unit: 1,
        choices: m.choices,
        label: m.label,
        ko: m.ko,
        kind: m.kind,
        score: m.score,
        print: m.print,
        no: m.no,
      },
    ]),
  );
}

export function jlptSections(level) {
  const spec = JLPT_SPEC[level];
  const counts = {};
  for (const m of jlptMondai(level)) counts[m.section] = (counts[m.section] ?? 0) + m.count;
  return Object.fromEntries(
    Object.entries(spec.sections).map(([id, minutes]) => [
      id,
      { label: JLPT_SECTION_LABEL[id], fullSeconds: minutes * 60, fullCount: counts[id], audio: id === "L" },
    ]),
  );
}

/**
 * Groups for a JLPT episode. `parts` lists the 問題 to include (default: all).
 * Listening groups carry `pictures`: which items use a bundled picture (grid or scene), assigned at creation.
 */
export function jlptBlueprint(level, parts = null) {
  const all = jlptMondai(level);
  const chosen = parts ? all.filter((m) => parts.includes(m.part)) : all;
  if (!chosen.length) throw Error("문제 유형을 하나 이상 선택하세요.");
  const groups = [];
  for (const m of chosen) {
    let left = m.count,
      n = 0,
      pictures = m.print === "scene" ? m.count : (m.pictures ?? 0);
    while (left > 0) {
      const count = Math.min(m.per, left);
      const g = {
        id: `m${m.part}-${++n}`,
        part: m.part,
        kind: m.kind,
        count,
        documents: m.docs,
        status: "pending",
      };
      if (m.section === "L") {
        const use = Math.min(count, pictures);
        pictures -= use;
        if (use) g.pictureKind = m.print === "scene" ? "scene" : "grid";
        g.pictureItems = use;
      }
      groups.push(g);
      left -= count;
    }
  }
  return groups;
}

/** Japanese text printed at the top of each 問題 (our own wording). */
export const JLPT_DIRECTIONS = {
  "kanji-reading": "＿＿＿のことばの読み方として最もよいものを、1・2・3・4から一つ選びなさい。",
  orthography: "＿＿＿のことばを漢字で書くとき、最もよいものを、1・2・3・4から一つ選びなさい。",
  "word-formation": "（　　）に入れるのに最もよいものを、1・2・3・4から一つ選びなさい。",
  context: "（　　）に入れるのに最もよいものを、1・2・3・4から一つ選びなさい。",
  paraphrase: "＿＿＿に意味が最も近いものを、1・2・3・4から一つ選びなさい。",
  usage: "次のことばの使い方として最もよいものを、1・2・3・4から一つ選びなさい。",
  "grammar-form": "次の文の（　　）に入れるのに最もよいものを、1・2・3・4から一つ選びなさい。",
  "sentence-order": "次の文の　★　に入る最もよいものを、1・2・3・4から一つ選びなさい。",
  "text-grammar": "次の文章を読んで、［1］から順に入る最もよいものを、1・2・3・4から一つ選びなさい。",
  "short-reading": "次の文章を読んで、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  "mid-reading": "次の文章を読んで、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  "long-reading": "次の文章を読んで、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  "integrated-reading":
    "次のAとBの文章を読んで、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  "thematic-reading":
    "次の文章を読んで、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  "info-retrieval":
    "右のページの案内を見て、質問に答えなさい。答えは1・2・3・4から最もよいものを一つ選びなさい。",
  task: "はじめに質問を聞いてください。それから話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。",
  point:
    "はじめに質問を聞いてください。そのあと、問題用紙の選択肢を読む時間があります。それから話を聞いて、1から4の中から最もよいものを一つ選んでください。",
  summary:
    "問題用紙には何も印刷されていません。話の全体としてどんな内容かを聞く問題です。話を聞いて、質問と選択肢を聞き、1から4の中から最もよいものを一つ選んでください。",
  utterance:
    "絵を見ながら質問を聞いてください。矢印（→）の人は何と言いますか。1から3の中から最もよいものを一つ選んでください。",
  quick:
    "問題用紙には何も印刷されていません。まず文を聞いてください。それから、その返事を聞いて、1から3の中から最もよいものを一つ選んでください。",
  "integrated-listening":
    "少し長い話を聞きます。問題用紙にメモをとってもかまいません。話を聞いて、1から4の中から最もよいものを一つ選んでください。",
};

/** Spoken directions at the start of a listening 問題 (narrator; our own wording, shorter than the printed text). */
export function spokenDirections(kind, no) {
  const say = {
    task: "はじめに質問を聞いてください。それから話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。",
    point:
      "はじめに質問を聞いてください。そのあと、選択肢を読む時間があります。それから話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。",
    summary:
      "問題用紙には何も印刷されていません。話を聞いて、それから質問と選択肢を聞いて、1から4の中から最もよいものを一つ選んでください。",
    utterance:
      "絵を見ながら質問を聞いてください。矢印の人は何と言いますか。1から3の中から最もよいものを一つ選んでください。",
    quick:
      "問題用紙には何も印刷されていません。まず文を聞いてください。それから返事を聞いて、1から3の中から最もよいものを一つ選んでください。",
    "integrated-listening":
      "少し長い話を聞きます。話を聞いて、問題用紙の1から4の中から、最もよいものを一つ選んでください。",
  }[kind];
  return `問題${no}。${say}`;
}

/** Answer and reading pauses for the listening timeline (seconds). */
export const JLPT_GAPS = { directions: 2, turn: 0.4, cue: 1, read: 10, answer: 10, short: 7 };

/** Estimated sectional scores (0–60 per scoring section; N4/N5 language+reading 0–120) and the pass check. */
export function jlptEstimate(level, rows, partInfo, full = true) {
  const spec = JLPT_SPEC[level];
  if (!spec) return null;
  const combined = level === "N4" || level === "N5";
  const buckets = combined
    ? { langread: { label: "言語知識・読解", max: 120 }, listen: { label: "聴解", max: 60 } }
    : {
        lang: { label: "言語知識", max: 60 },
        read: { label: "読解", max: 60 },
        listen: { label: "聴解", max: 60 },
      };
  for (const b of Object.values(buckets)) Object.assign(b, { correct: 0, total: 0 });
  for (const r of rows) {
    const score = partInfo[r.part]?.score;
    if (!score) continue;
    const key = combined && score !== "listen" ? "langread" : score;
    buckets[key].total++;
    if (r.correct) buckets[key].correct++;
  }
  let total = 0,
    complete = true;
  for (const [key, b] of Object.entries(buckets)) {
    b.score = b.total ? Math.round((b.max * b.correct) / b.total) : null;
    b.min = spec.pass.min[key];
    if (b.score === null) complete = false;
    else total += b.score;
  }
  const failed = Object.entries(buckets)
    .filter(([, b]) => b.score !== null && b.score < b.min)
    .map(([k]) => k);
  return {
    level,
    sections: buckets,
    total,
    max: 180,
    passMark: spec.pass.total,
    // Pass/fail only for a whole test: a practice set of some 問題 cannot stand for the real score.
    complete: complete && full,
    passed: complete && full ? !failed.length && total >= spec.pass.total : null,
    failed,
  };
}

/**
 * Inline markup in generated Japanese text: {漢字|かんじ} → ruby, __語__ → underlined target.
 * Returns plain parts so both the browser (DOM) and the server (spoken text) can use it.
 */
export function rubyParts(text) {
  const out = [];
  const re = /\{([^{}|]{1,20})\|([^{}|]{1,30})\}|__([^_]{1,40})__/g;
  let at = 0,
    m;
  const s = String(text ?? "");
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ text: s.slice(at, m.index) });
    if (m[1]) out.push({ base: m[1], ruby: m[2] });
    else out.push({ under: m[3] });
    at = re.lastIndex;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/** Text without markup (ruby keeps the base form), for narration and plain displays. */
export const plainJa = (text) =>
  rubyParts(text)
    .map((p) => p.text ?? p.base ?? p.under)
    .join("");
