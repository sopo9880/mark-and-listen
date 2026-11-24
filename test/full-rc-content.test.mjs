import assert from "node:assert/strict";
import { test } from "node:test";
import { rcQuestions } from "../public/full-rc.mjs";

const count = (predicate) => rcQuestions.filter(predicate).length;
const group = (qs) => Map.groupBy(qs, (q) => q.passageId);
const partQuestions = (part) => rcQuestions.filter((q) => q.part === part);

test("RC has continuous unique IDs 101–200 and the complete part split", () => {
  assert.deepEqual(rcQuestions.map(q => q.id), Array.from({length:100}, (_, i) => 101 + i));
  assert.deepEqual([5, 6, 7].map((part) => count(q => q.part === part)), [30, 16, 54]);
  assert.equal(new Set(rcQuestions.map(q => q.prompt)).size, 100);
});

test("every RC question has 4 distinct choices, one indexed key and Korean feedback", () => {
  const totals = [0,0,0,0];
  for (const q of rcQuestions) {
    assert.equal(q.options.length, 4, String(q.id));
    assert.ok(q.options.every(option => typeof option === "string" && option.trim().length > 0));
    assert.equal(new Set(q.options.map(option => option.trim().toLowerCase())).size, 4, String(q.id));
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, String(q.id));
    assert.ok(q.options[q.answer]);
    assert.match(q.rationale, /[가-힣]/u);
    totals[q.answer]++;
  }
  assert.ok(totals.every(n => n >= 22 && n <= 28), totals.join(", "));
});

test("RC source documents match question groups, including all Part 6 blanks and Part 7 split", () => {
  assert.ok(partQuestions(5).every(q => q.passageId === null && !q.passages.length));
  const groups6 = group(partQuestions(6));
  assert.equal(groups6.size, 4);
  for (const qs of groups6.values()) {
    assert.equal(qs.length, 4);
    assert.equal(qs[0].passages.length, 1);
    const text = qs[0].passages[0].text;
    assert.deepEqual([...text.matchAll(/\[(\d{3})\]/g)].map(m => +m[1]), qs.map(q => q.id));
    for (const q of qs) assert.ok(q.prompt.includes(`[${q.id}]`));
  }
  const groups7 = group(partQuestions(7));
  const groupsByDocs = Map.groupBy(groups7.values(), qs => qs[0].passages.length);
  assert.deepEqual([1,2,3].map(n => groupsByDocs.get(n)?.length), [10,3,2]);
  assert.deepEqual([1,2,3].map(n => groupsByDocs.get(n)?.flat().length), [29,15,10]);
  for (const qs of [...groups6.values(), ...groups7.values()]) {
    const passages = qs[0].passages;
    assert.ok(qs[0].passageId);
    for (const p of passages) assert.ok(p.title.length && p.text.length > 80);
    for (const q of qs) assert.deepEqual(q.passages, passages, String(q.id));
  }
});

test("full-exam normalization retains the RC correct option and final triple-document group", async () => {
  const { normalizeFullData } = await import("../public/full-exam.mjs");
  const placeholderLc = Array.from({length:100}, (_, i) => ({ id:`lc-fixture-${i + 1}`, number:i + 1, section:"LC" }));
  const full = normalizeFullData(placeholderLc, rcQuestions);
  assert.equal(full.length, 200);
  for (const q of full.slice(100)) {
    const original = rcQuestions[q.number - 101];
    assert.equal(q.section, "RC");
    assert.equal(q.choices[q.answer], original.options[original.answer]);
    assert.equal(q.explanation, original.rationale);
    assert.equal(q.groupId, original.passageId);
    assert.deepEqual(q.passages, original.passages);
  }
  const final = full.at(-1);
  assert.equal(final.passages.length, 3);
  assert.equal(full.filter(q => q.groupId === final.groupId).length, 5);
  assert.equal(final.choices[final.answer], "$314");
});

test("RC answer keys are balanced within each part and do not follow short repeating cycles", () => {
  for (const part of [5, 6, 7]) {
    const keys = partQuestions(part).map(q => q.answer);
    const totals = [0,1,2,3].map(answer => keys.filter(k => k === answer).length);
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 1, `Part ${part}: ${totals}`);
    for (let lag = 1; lag <= 8; lag++) {
      const sample = keys.slice(lag);
      const matches = sample.filter((key, i) => key === keys[i]).length;
      assert.ok(matches / sample.length <= 0.43, `Part ${part}, lag ${lag}: ${matches}/${sample.length}`);
    }
  }
});
