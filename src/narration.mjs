// Word-level comparison of a narration script with the provider's transcript.
// Formatting differences (case, punctuation, digits vs. words, contractions, choice labels heard as
// homophones) are normalized away; changed words, numbers, negations and word order still fail.

const UNITS = "zero one two three four five six seven eight nine".split(" ");
const TEENS = "ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const CARDINAL = new Map([
  ...UNITS.map((w, i) => [w, i]),
  ...TEENS.map((w, i) => [w, 10 + i]),
  ...TENS.map((w, i) => [w, (i + 2) * 10]),
]);
const ORDINAL = new Map(
  Object.entries({
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14,
    fifteenth: 15,
    sixteenth: 16,
    seventeenth: 17,
    eighteenth: 18,
    nineteenth: 19,
    twentieth: 20,
    thirtieth: 30,
    fortieth: 40,
    fiftieth: 50,
    sixtieth: 60,
    seventieth: 70,
    eightieth: 80,
    ninetieth: 90,
  }),
);
const CONTRACTIONS = {
  "can't": "can not",
  cannot: "can not",
  "won't": "will not",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "couldn't": "could not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "mustn't": "must not",
  "needn't": "need not",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "here's": "here is",
  "what's": "what is",
  "where's": "where is",
  "who's": "who is",
  "he's": "he is",
  "she's": "she is",
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "they'll": "they will",
  "he'll": "he will",
  "she'll": "she will",
  "it'll": "it will",
  "i'd": "i would",
  "you'd": "you would",
  "we'd": "we would",
  "they'd": "they would",
  ok: "okay",
  "o'clock": "oclock",
};
const SPELLINGS = {
  percentage: "percentage",
  "per cent": "percent",
  dollar: "dollars",
  euro: "euros",
  pound: "pounds",
};
const CURRENCY = { $: "dollars", "€": "euros", "£": "pounds" };

/** Choice labels as the transcript may spell them ("C" is often transcribed as "see"). */
const LABEL_SOUNDS = {
  a: ["a", "eh", "ay", "hey"],
  b: ["b", "be", "bee"],
  c: ["c", "see", "sea", "si"],
  d: ["d", "dee"],
  e: ["e"],
};

function prepare(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\bper cent\b/g, "percent")
    .replace(/\b([ap])\.\s?m\.?(?=\s|$|[,;!?])/g, "$1m")
    .replace(/(\d)\s?([ap])m\b/g, "$1 $2m")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1 #ord")
    .replace(
      /([$€£])\s?(\d[\d,]*)(?:\.(\d{2}))?/g,
      (_, c, whole, cents) => `${whole} ${CURRENCY[c]}${cents ? " " + cents : ""}`,
    )
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
    .replace(/(^|\s)[-−](?=\d)/g, "$1minus ")
    .replace(/\b(\d{1,2}):00\b/g, "$1")
    .replace(/\b(\d{1,2}):(\d{2})\b/g, "$1 $2")
    .replace(/\b(\d+)\.(\d+)\b/g, "$1 point $2")
    .replace(/\b[a-z]+(?:'[a-z]+)?\b/g, (w) => CONTRACTIONS[w] ?? SPELLINGS[w] ?? w);
}

/** Reads a run of English number words starting at i. Returns [value, nextIndex, ordinal] or null. */
function readNumber(words, i) {
  let total = 0,
    current = 0,
    used = 0,
    ordinal = false;
  const start = i;
  for (; i < words.length; i++) {
    const w = words[i];
    const prev = current % 100;
    if (w === "a" && (words[i + 1] === "hundred" || words[i + 1] === "thousand") && !used) {
      current = 1;
      used++;
      continue;
    }
    if (CARDINAL.has(w)) {
      const n = CARDINAL.get(w);
      // A new tens/teen word or a second unit starts a new number ("twenty twenty-six", "nine nine").
      if (used && ((n >= 10 && prev !== 0) || (n < 10 && (prev % 10 !== 0 || (prev >= 10 && prev < 20)))))
        break;
      if (used && n === 0) break;
      current += n;
    } else if (ORDINAL.has(w)) {
      const n = ORDINAL.get(w);
      if (used && ((n >= 10 && prev !== 0) || (n < 10 && (prev % 10 !== 0 || (prev >= 10 && prev < 20)))))
        break;
      current += n;
      ordinal = true;
      i++;
      used++;
      break;
    } else if ((w === "hundred" || w === "hundredth") && used) {
      current = (current || 1) * 100;
      if (w === "hundredth") {
        ordinal = true;
        i++;
        used++;
        break;
      }
    } else if ((w === "thousand" || w === "thousandth") && used) {
      total += (current || 1) * 1000;
      current = 0;
      if (w === "thousandth") {
        ordinal = true;
        i++;
        used++;
        break;
      }
    } else if (
      w === "and" &&
      used &&
      current % 100 === 0 &&
      current + total > 0 &&
      CARDINAL.has(words[i + 1])
    ) {
      continue;
    } else break;
    used++;
  }
  if (!used || i === start) return null;
  return [total + current, i, ordinal];
}

export function narrationTokens(value = "") {
  const words = prepare(value).match(/#ord|§[a-e]|[\p{L}]+(?:'[\p{L}]+)?|[0-9]+/gu) ?? [];
  const out = [];
  for (let i = 0; i < words.length;) {
    const word = words[i];
    if (/^\d+$/.test(word)) {
      const ord = words[i + 1] === "#ord";
      out.push(String(BigInt(word)) + (ord ? "#" : ""));
      i += ord ? 2 : 1;
      continue;
    }
    if (word === "#ord") {
      i++;
      continue;
    }
    const parsed = readNumber(words, i);
    if (parsed) {
      const [n, next, ordinal] = parsed;
      out.push(String(n) + (ordinal ? "#" : ""));
      i = next;
      continue;
    }
    out.push(word);
    i++;
  }
  // "five dollars and fifty cents" == "$5.50": drop connective "and" and trailing "cents" after dollars.
  const num = (t) => /^\d+$/.test(t ?? "");
  return out
    .map((t, i, a) => (t === "oh" && num(a[i - 1]) && num(a[i + 1]) ? "0" : t))
    .filter(
      (t, i, a) =>
        !(t === "and" && a[i - 1] === "dollars" && /^\d+$/.test(a[i + 1] ?? "")) &&
        !(
          t === "cents" &&
          /^\d+$/.test(a[i - 1] ?? "") &&
          a.slice(Math.max(0, i - 4), i).includes("dollars")
        ) &&
        t !== "oclock",
    );
}

/** Longest common subsequence alignment → ordered hunks of equal / missing / added tokens. */
function align(a, b, eq = (x, y) => x === y) {
  // Weighted LCS: identical tokens score 2, label↔homophone matches score 1, so real words win ties.
  const n = a.length,
    m = b.length;
  const score = (x, y) => (x === y ? 2 : eq(x, y) ? 1 : 0);
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const w = score(a[i], b[j]);
      dp[i][j] = Math.max(w ? dp[i + 1][j + 1] + w : 0, dp[i + 1][j], dp[i][j + 1]);
    }
  const ops = [];
  const push = (type, token) => {
    const last = ops.at(-1);
    if (last?.type === type) last.tokens.push(token);
    else ops.push({ type, tokens: [token] });
  };
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && score(a[i], b[j]) && dp[i][j] === dp[i + 1][j + 1] + score(a[i], b[j])) {
      push("equal", a[i++]);
      j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) push("added", b[j++]);
    else push("missing", a[i++]);
  }
  // Merge adjacent missing/added runs into "changed" hunks and forgive pure joins ("e mail" ↔ "email", "20 26" ↔ "2026").
  const merged = [];
  for (const op of ops) {
    const last = merged.at(-1);
    if (last && last.type !== "equal" && op.type !== "equal" && last.type !== op.type) {
      last.type = "changed";
      last[op.type] = op.tokens;
      continue;
    }
    if (op.type === "equal") merged.push({ type: "equal", tokens: op.tokens });
    else merged.push({ type: op.type, [op.type]: op.tokens });
  }
  return merged.map((h) =>
    h.type === "changed" && h.missing.join("").replace(/#/g, "") === h.added.join("").replace(/#/g, "")
      ? { type: "equal", tokens: h.added, joined: true }
      : h,
  );
}

const isLabel = (t) => /^§[a-e]$/.test(t ?? "");

/** Forgives choice labels that were not transcribed or were transcribed as homophones ("C." → "see"). */
function forgiveLabels(ops) {
  let heard = 0,
    unconfirmed = 0;
  const out = ops.map((h) => {
    if (h.type === "equal") {
      heard += h.tokens.filter(isLabel).length;
      return h;
    }
    if (!(h.missing ?? []).some(isLabel)) return h;
    const missing = [...h.missing],
      added = [...(h.added ?? [])];
    const kept = [];
    for (const t of missing) {
      if (!isLabel(t)) {
        kept.push(t);
        continue;
      }
      if (LABEL_SOUNDS[t[1]].includes(added[0])) {
        added.shift();
        heard++;
      } else unconfirmed++;
    }
    if (!kept.length && !added.length) return { type: "equal", tokens: [], label: true };
    return {
      type: kept.length && added.length ? "changed" : kept.length ? "missing" : "added",
      missing: kept,
      added,
    };
  });
  return { ops: out, labels: { heard, unconfirmed } };
}

const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
export const isJapanese = (s) => JA.test(String(s ?? ""));
const KANJI_DIGITS = {
  〇: "0",
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};

/** Japanese script → comparable characters: width/case folded, katakana as hiragana, no punctuation or spaces. */
export function jaChars(value = "") {
  return [
    ...String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/(^|\n)\s*[1-4][.)．、]\s*/g, "$1") // spoken option numbers
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[〇一二三四五六七八九]/g, (c) => KANJI_DIGITS[c])
      .replace(/[^\p{L}\p{N}]/gu, ""),
  ];
}

/**
 * Japanese narration check. A transcript may write the same words with other kanji/kana choices, so this is a
 * character alignment with tolerance: most script characters must be heard in order and little may be added.
 */
const ITEM_NO = /^\s*\d+\s*番[。、.]?/;
const HEARD_NO =
  /^\s*(?:(?:\d+|[〇一二三四五六七八九十]+)\s*番|(?:いち|に|さん|よん|ご|ろく|なな|しち|はち|きゅう|く|じゅう){1,3}ばん)[。、.]?/;
const NEGATION = /ません|ない|なかっ|ず[、。に]|ぬ/g;

export function japaneseDiff(expected, actual) {
  // "3番" may be heard as "さんばん": the item number is checked by length only.
  const numbered = ITEM_NO.test(expected);
  let said = String(actual ?? "");
  if (numbered) said = said.replace(HEARD_NO, "");
  // Spoken option numbers ("1. …" heard as "いち、…") are not part of the comparison.
  if (/(^|\n)\s*[1-4][.)．]/.test(expected))
    said = said.replace(/(^|[。．.、\n\s])(?:いち|に|さん|よん|[1-4一二三四])[、。．.,\s]/g, "$1");
  const want = jaChars(numbered ? String(expected).replace(ITEM_NO, "") : expected),
    heard = jaChars(said);
  if (!want.length && numbered)
    return {
      exact: heard.length <= 8,
      japanese: true,
      recall: 1,
      missing: [],
      added: heard,
      ops: [],
      labels: { heard: 0, unconfirmed: 0 },
    };
  const ops = align(want, heard);
  const missing = ops.flatMap((h) => h.missing ?? []);
  const added = ops.flatMap((h) => h.added ?? []);
  const matched = want.length - missing.length;
  const recall = want.length ? matched / want.length : 0;
  const extra = heard.length ? added.length / heard.length : 1;
  return {
    // A changed negation flips the meaning even when most characters match.
    exact:
      want.length > 0 &&
      recall >= 0.8 &&
      extra <= 0.25 &&
      (String(expected).match(NEGATION) ?? []).length === (String(actual ?? "").match(NEGATION) ?? []).length,
    japanese: true,
    recall: Math.round(recall * 100) / 100,
    missing: missing.length > 40 ? [...missing.slice(0, 40), "…"] : missing,
    added: added.length > 40 ? [...added.slice(0, 40), "…"] : added,
    ops: ops.filter((h) => h.type !== "equal"),
    labels: { heard: 0, unconfirmed: 0 },
  };
}

export function transcriptDiff(expected, actual) {
  if (isJapanese(expected)) return japaneseDiff(expected, actual);
  const script = String(expected ?? "").replace(/(^|\n)[ \t]*\(?([A-Ea-e])[.)][ \t]+/g, "$1§$2 ");
  const want = narrationTokens(script);
  const heard = narrationTokens(actual);
  const { ops, labels } = forgiveLabels(
    align(want, heard, (x, y) => x === y || (isLabel(x) && LABEL_SOUNDS[x[1]].includes(y))),
  );
  const missing = ops.flatMap((h) => h.missing ?? []);
  const added = ops.flatMap((h) => h.added ?? []);
  const content = want.filter((t) => !isLabel(t));
  return {
    exact: content.length > 0 && !missing.length && !added.length,
    missing,
    added,
    ops: ops.filter((h) => h.type !== "equal" || h.tokens.length),
    labels,
  };
}

const wavSeconds = (wav) =>
  Buffer.isBuffer(wav) && wav.length > 44 ? (wav.length - 44) / (wav.readUInt32LE(28) || 48000) : 0;

/**
 * Narrates `args.prompt` up to three times until the saved audio matches the script.
 * With `check.transcribe`, the comparison uses an independent transcription of the WAV bytes (not the Live
 * session's own transcript), and `check.duration` first rejects clips whose length cannot hold the script.
 */
export async function verifiedNarration(speak, args, check = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    args.signal?.throwIfAborted();
    const take = await speak(args);
    if (check.duration) {
      const { plausibleDuration } = await import("./stt.mjs");
      const fit = plausibleDuration(args.prompt, wavSeconds(take.wav));
      if (!fit.ok) {
        last = {
          transcript: take.transcript,
          diff: { exact: false, missing: [], added: [], ops: [], reason: fit.reason },
        };
        continue;
      }
    }
    // transcribe() may return null when the transcription service is busy: the Live transcript is used then.
    const heard = check.transcribe ? await check.transcribe(take.wav) : null;
    const transcript = heard ?? take.transcript;
    const diff = transcriptDiff(args.prompt, transcript);
    if (diff.exact)
      return {
        ...take,
        transcript,
        liveTranscript: take.transcript,
        diff,
        attempts: attempt + 1,
        sttChecked: heard !== null,
      };
    last = { transcript, diff };
  }
  throw Object.assign(Error("대본과 실제 음원이 세 번 일치하지 않았습니다. 해당 구간만 다시 생성하세요."), {
    code: "NARRATION_MISMATCH",
    last,
  });
}
