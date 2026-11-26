import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.mjs";
import { batchPrompt, pickBatch } from "../src/batch.mjs";
import { blueprint } from "../public/lib/exams.mjs";

const q = (n) => ({
  question: `Sentence ${n}: The team _____ the order yesterday.`,
  choices: ["confirm", "confirmed", "confirming", "confirms"],
  answer: 1,
  explanation: "과거 시제",
});

test("one Codex call makes several sets; shared rules are stated once; a bad set alone is retried", async (t) => {
  const e = { exam: "toeic", groups: blueprint("toeic", { 5: 30, 3: 12 }) };
  const p5 = e.groups.filter((g) => g.part === 5);
  assert.equal(pickBatch(e, p5[0]).length, 15);
  const p3 = e.groups.filter((g) => g.part === 3);
  assert.equal(pickBatch(e, p3[0]).length, 4);
  const prompt = batchPrompt(pickBatch(e, p5[0]));
  assert.match(prompt, /Create 15 independent/);
  assert.equal(prompt.split("One _____ blank per question").length, 2, "common rule appears once");

  const root = await mkdtemp(join(tmpdir(), "ml-batch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const codex = async ({ prompt }) => {
    if (prompt.includes("independently checking")) {
      calls.push("solve");
      return JSON.stringify({ sets: [{ answers: [1] }, { answers: [1] }] });
    }
    calls.push("make");
    return JSON.stringify({
      sets: [{ questions: [q(1)] }, { questions: [{ question: "broken" }] }, { questions: [q(3)] }],
    });
  };
  const updater = { status: async () => ({ supported: false }), executable: async () => null };
  const { server } = await buildServer({ root, updater, autoUpdate: false, codex });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const token = (await (await fetch(base + "/api/session")).json()).token;
  const post = async (path, data) =>
    (
      await fetch(base + "/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mark-Session": token },
        body: JSON.stringify(data),
      })
    ).json();
  const ep = await post("episodes", { exam: "toeic", counts: { 5: 3 } });
  const r = await post("produce", { id: ep.id });
  assert.deepEqual(calls, ["make", "solve"], "three sets: one make call and one solve call");
  assert.deepEqual(
    r.episode.groups.map((g) => g.status),
    ["ready", "pending", "ready"],
  );
  assert.match(r.episode.groups[1].lastError, /형식|문항/);
  assert.equal(r.episode.stats.codex.calls, 2);
});
