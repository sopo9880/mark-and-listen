// Raw-score grading. Pass/fail is only computed for exams whose episode config carries an explicit rule.
import { partsOf, examOf, questionsOf, questionNumbers } from "./exams.mjs";
import { jlptEstimate } from "./jlpt.mjs";

const summarize = (rows) => {
  const correct = rows.filter((r) => r.correct).length;
  return {
    correct,
    total: rows.length,
    unsolved: rows.filter((r) => r.mark == null).length,
    percent: rows.length ? Math.round((correct / rows.length) * 1000) / 10 : 0,
  };
};

export function gradeRows(e, marks = {}) {
  const numbers = questionNumbers(e);
  return questionsOf(e).map((q, index) => {
    const mark = Object.hasOwn(marks, q.id) ? marks[q.id] : null;
    return {
      id: q.id,
      number: numbers.get(q.id) ?? index + 1,
      part: q.part,
      section: q.section,
      mark,
      correct: mark === q.answer,
    };
  });
}

export function scoreAttempt(e, marks = {}) {
  const rows = gradeRows(e, marks);
  const parts = partsOf(e);
  const bySection = {},
    byPart = {};
  for (const id of Object.keys(examOf(e).sections)) {
    const list = rows.filter((r) => r.section === id);
    if (list.length) bySection[id] = summarize(list);
  }
  for (const part of [...new Set(rows.map((r) => r.part))]) {
    byPart[part] = {
      label: parts[part]?.label ?? String(part),
      ...summarize(rows.filter((r) => r.part === part)),
    };
  }
  const summary = { ...summarize(rows), bySection, byPart };
  if (e.exam === "jlpt") {
    const full = Object.entries(parts).every(
      ([p, info]) => rows.filter((r) => r.part === Number(p)).length === info.count,
    );
    summary.jlpt = jlptEstimate(e.config?.level, rows, parts, full);
  }
  const rule = e.config?.passRule;
  if (rule) {
    const scores = Object.values(byPart).map((p) => p.percent);
    const average = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;
    const failed = Object.entries(byPart)
      .filter(([, p]) => rule.subjectMin != null && p.percent < rule.subjectMin)
      .map(([part]) => Number(part));
    summary.pass = { average, failed, passed: !failed.length && average >= (rule.averageMin ?? 0), rule };
  }
  return { ...summary, rows };
}
