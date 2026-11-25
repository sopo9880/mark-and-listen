import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeminiLivePool } from "../src/gemini-live-pool.mjs";
import { levelWav } from "../src/audio-level.mjs";
import { wavFromPcm } from "../src/gemini-live.mjs";

class FakeSocket extends EventTarget {
  sent = [];
  closed = 0;
  send(value) {
    this.sent.push(JSON.parse(value));
    queueMicrotask(() => this.onSend?.(JSON.parse(value)));
  }
  close() {
    if (this.closed++) return;
    this.dispatchEvent(new Event("close"));
  }
  emit(value) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}
const pcm = (n) => Buffer.alloc(n * 2, 7).toString("base64");

function server({ silentFor = () => false } = {}) {
  const sockets = [];
  const factory = () => {
    const s = new FakeSocket();
    sockets.push(s);
    s.onSend = (msg) => {
      if (msg.setup) return s.emit({ setupComplete: {} });
      const text = msg.clientContent?.turns[0].parts[0].text ?? msg.realtimeInput?.text;
      const script = text.split("BEGIN SCRIPT\n")[1].split("\nEND SCRIPT")[0];
      if (!silentFor(msg))
        s.emit({
          serverContent: {
            modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm(240) } }] },
          },
        });
      s.emit({ serverContent: { outputTranscription: { text: script } } });
      s.emit({ serverContent: { turnComplete: true } });
    };
    queueMicrotask(() => s.dispatchEvent(new Event("open")));
    return s;
  };
  return { sockets, factory };
}
const args = { apiKey: "MOCK-KEY-123", model: "gemini-3.8-live", voice: "Charon" };

test("one Live session per model and voice is reused across segments", async () => {
  const { sockets, factory } = server();
  const pool = createGeminiLivePool({ webSocketFactory: factory });
  for (const prompt of ["Number one.", "Number two.", "Number three."]) {
    const r = await pool.speak({ ...args, prompt });
    assert.equal(r.transcript, prompt);
  }
  await pool.speak({ ...args, voice: "Kore", prompt: "Hello." });
  assert.equal(sockets.length, 2, "one socket for Charon, one for Kore");
  const turns = sockets[0].sent.filter((m) => !m.setup);
  assert.equal(sockets[0].sent.filter((m) => m.setup).length, 1);
  assert.equal(turns.length, 3);
  assert.doesNotMatch(turns[0].clientContent.turns[0].parts[0].text, /^New script/);
  assert.match(turns[1].clientContent.turns[0].parts[0].text, /^New script/);
  pool.closeAll();
  assert.ok(sockets.every((s) => s.closed));
});

test("sessions renew after the turn limit and after a dropped connection", async () => {
  const { sockets, factory } = server();
  const pool = createGeminiLivePool({ webSocketFactory: factory, maxTurns: 2 });
  for (let i = 0; i < 3; i++) await pool.speak({ ...args, prompt: `Line ${i}.` });
  assert.equal(sockets.length, 2);
  sockets[1].close(); // server drops the session while idle
  await pool.speak({ ...args, prompt: "Again." });
  assert.equal(sockets.length, 3);
  pool.closeAll();
});

test("a model that stays silent for one input style is retried with the other", async () => {
  const { sockets, factory } = server({ silentFor: (m) => !!m.realtimeInput });
  const events = [];
  const pool = createGeminiLivePool({ webSocketFactory: factory, onEvent: (m) => events.push(m) });
  const old = { ...args, model: "gemini-2.5-flash-native-audio-preview-12-2025" };
  assert.equal((await pool.speak({ ...old, prompt: "Number one." })).transcript, "Number one.");
  assert.equal((await pool.speak({ ...old, prompt: "Number two." })).transcript, "Number two.");
  const sent = sockets[0].sent.filter((m) => !m.setup);
  assert.ok(sent[0].realtimeInput && sent[1].clientContent && sent[2].clientContent);
  assert.ok(events.some((m) => /음성 없이/.test(m)));
  pool.closeAll();
});

test("narration is trimmed and leveled to the directions' loudness", () => {
  const rate = 24000;
  const samples = Buffer.alloc(rate * 2 * 2);
  for (let i = 0; i < rate * 2; i++) {
    const inSpeech = i > rate * 0.5 && i < rate * 1.5;
    samples.writeInt16LE(inSpeech ? Math.round(32767 * Math.sin(i / 7)) : 0, i * 2);
  }
  const hot = wavFromPcm([samples], samples.length, rate);
  const out = levelWav(hot);
  const n = (out.length - 44) / 2;
  assert.ok(n / rate < 1.5 && n / rate > 1.2, `trimmed to ${n / rate}s`);
  let peak = 0,
    sum = 0;
  for (let i = 0; i < n; i++) {
    const v = out.readInt16LE(44 + i * 2) / 32768;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  assert.ok(20 * Math.log10(peak) <= -0.99, "peak at most -1 dBFS");
  assert.equal(out.readUInt32LE(40), out.length - 44);
  // Quiet test tones are left as they are.
  const quiet = wavFromPcm([Buffer.alloc(4800, 1)], 4800, rate);
  assert.equal(levelWav(quiet), quiet);
});
