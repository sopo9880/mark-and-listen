import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDoc, docText, DOC_TYPES } from "../public/lib/docs.mjs";
import { parseGroup } from "../src/episode-content.mjs";
import { SAMPLES } from "./fixtures/docs-samples.mjs";

test("every document type validates and has a readable text form", () => {
  const seen = new Set();
  for (const d of SAMPLES) {
    const v = validateDoc(d);
    seen.add(v.type);
    assert.ok(docText(v).length > 10, v.type);
  }
  assert.deepEqual([...seen].sort(), Object.keys(DOC_TYPES).sort());
  assert.throws(() => validateDoc({ type: "hologram" }), /지원하지 않는/);
  assert.throws(() => validateDoc({ ...SAMPLES[16], series: [{ name: "x", values: [1] }] }), /그래프|목록/);
  assert.throws(
    () =>
      validateDoc({
        ...SAMPLES[19],
        cells: [
          { r: 4, c: 1, label: "far" },
          { r: 1, c: 1, label: "a" },
        ],
      }),
    /범위/,
  );
  assert.match(docText(SAMPLES[19]), /Building 1 \| Picnic Area \| Building 2/);
});

test("Part 7 documents are parsed as typed documents and their text is what the checker reads", () => {
  const g = { id: "p7-11", part: 7, count: 2, documents: 2, status: "pending" };
  const q = (question) => ({ question, choices: ["a", "b", "c", "d"], answer: 0, explanation: "해설" });
  const parsed = parseGroup(
    {
      passages: [SAMPLES[0], SAMPLES[10]],
      turns: [],
      questions: [q("Why was the e-mail sent?"), q("What is true about Mr. Ruiz?")],
    },
    g,
    {
      exam: "toeic",
    },
  );
  assert.equal(parsed.passages[0].doc.type, "email");
  assert.equal(parsed.passages[0].title, "e-mail");
  assert.match(parsed.passages[1].body, /Preferred shift: Saturday morning/);
  // Part 6 blanks are checked in the document body.
  const p6 = { id: "p6-1", part: 6, count: 4, documents: 1, status: "pending" };
  const body = "Dear staff, [1] the move. [2] Thanks. [3] Next week [4] begins.";
  assert.equal(
    parseGroup(
      { passages: [{ ...SAMPLES[1], body }], turns: [], questions: [q("1"), q("2"), q("3"), q("4")] },
      p6,
      { exam: "toeic" },
    ).passages[0].doc.type,
    "memo",
  );
});
