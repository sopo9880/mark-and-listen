import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditionWithGeminiLive, DEFAULT_GEMINI_LIVE_MODEL } from '../src/gemini-live.mjs';

const key = 'MOCK-NOT-A-REAL-KEY';
const input = { apiKey: key, prompt: '별이 다시 떠올라' };
class FakeSocket extends EventTarget {
  sent = [];
  closed = 0;
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed++; this.dispatchEvent(new Event('close')); }
  open() { this.dispatchEvent(new Event('open')); }
  emit(value, binary = false) {
    const raw = JSON.stringify(value);
    const data = binary ? new TextEncoder().encode(raw).buffer : raw;
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}
function take(overrides = {}) {
  const socket = new FakeSocket();
  const promise = auditionWithGeminiLive({
    ...input,
    ...overrides,
    webSocketFactory(url, apiKey) {
      assert.equal(apiKey, key);
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      assert.equal(new URL(url).search, '');
      assert.match(url, /\/google\.ai\.generativelanguage\.v1beta\.GenerativeService\.BidiGenerateContent$/);
      return socket;
    },
  });
  return { socket, promise };
}
function setup(socket) {
  socket.open();
  assert.equal(socket.binaryType, 'arraybuffer');
  assert.deepEqual(socket.sent[0].setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(socket.sent.length, 1, 'no prompt before setup acknowledgement');
  socket.emit({ setupComplete: {} });
}
const pcm = (bytes, rate = 24000) => ({
  inlineData: { mimeType: `audio/pcm;rate=${rate}`, data: Buffer.from(bytes).toString('base64') },
});

test('Gemini Live preserves ordered PCM chunks in a mono 24 kHz 16-bit WAV', async () => {
  const { socket, promise } = take();
  setup(socket);
  assert.equal(socket.sent[0].setup.model, `models/${DEFAULT_GEMINI_LIVE_MODEL}`);
  assert.match(socket.sent[1].clientContent.turns[0].parts[0].text, /BEGIN SCRIPT\n별이 다시 떠올라\nEND SCRIPT/);
  assert.equal(socket.sent[1].clientContent.turnComplete, true);
  assert.equal(JSON.stringify(socket.sent).includes(key), false);
  socket.emit({ setupComplete: {} }); // duplicated event must not trigger a second billed turn
  assert.equal(socket.sent.length, 2);
  socket.emit({ serverContent: { outputTranscription: { text: '별이 다시 ' } } }, true);
  socket.emit({ serverContent: { modelTurn: { parts: [pcm([1, 2, 3]), { text: 'ignored' }] } } });
  socket.emit({ serverContent: { modelTurn: { parts: [pcm([4, 5, 6])] }, outputTranscription: { text: '떠올라' }, turnComplete: true } });
  const { wav, transcript, model } = await promise;
  assert.equal(model, DEFAULT_GEMINI_LIVE_MODEL);
  assert.equal(transcript, input.prompt);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 6);
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4, 5, 6]);
  assert.equal(socket.closed, 1);
});

test('cancel after PCM but before turn completion returns no take', async () => {
  const controller = new AbortController();
  const { socket, promise } = take({ signal: controller.signal });
  setup(socket);
  socket.emit({ serverContent: { modelTurn: { parts: [pcm([1, 2])] } } });
  controller.abort(new Error(key));
  socket.emit({ serverContent: { turnComplete: true } });
  await assert.rejects(promise, /^Error: Audition cancelled\.$/);
  assert.equal(socket.closed, 1);
});

test('transcript-only or interrupted turns do not return silent or partial WAVs', async () => {
  for (const payload of [
    { outputTranscription: { text: '소리 없음' }, turnComplete: true },
    { modelTurn: { parts: [pcm([1, 2])] }, interrupted: true, turnComplete: true },
  ]) {
    const { socket, promise } = take();
    setup(socket);
    socket.emit({ serverContent: payload });
    await assert.rejects(promise, /no complete PCM|interrupted/);
  }
});

test('mixed sample rates, invalid base64, and provider error data are safely rejected', async () => {
  for (const parts of [
    [pcm([1, 2]), pcm([3, 4], 16000)],
    [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'not base64!!!' } }],
  ]) {
    const { socket, promise } = take();
    setup(socket);
    socket.emit({ serverContent: { modelTurn: { parts }, turnComplete: true } });
    await assert.rejects(promise, /sample rate|malformed PCM/);
  }
  const { socket, promise } = take();
  setup(socket);
  socket.emit({ error: { message: key } });
  await assert.rejects(promise, (error) => /rejected/.test(error.message) && !error.message.includes(key));
});

test('one Gemini request contains the complete ordered A–D script and collects multiple output events', async () => {
  const script = 'A. The doors are shut. B. A chair is upside down. C. Three boxes are stacked. D. The room is not empty.';
  for (const model of ['gemini-3.8-live','gemini-3.1-flash-live-preview']) {
    const {socket,promise}=take({prompt:script,model});
    setup(socket);
    const turn=socket.sent[1];
    const text=turn.realtimeInput?.text??turn.clientContent.turns[0].parts[0].text;
    assert.ok(text.includes(script));
    assert.equal(socket.sent.length,2);
    const split=script.indexOf(' C.');
    socket.emit({serverContent:{modelTurn:{parts:[pcm([1,2])]},outputTranscription:{text:script.slice(0,split)}}});
    socket.emit({serverContent:{modelTurn:{parts:[pcm([3,4])]},outputTranscription:{text:script.slice(split)},turnComplete:true}});
    assert.equal((await promise).transcript,script);
  }
});
