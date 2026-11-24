import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { buildServer } from '../src/server.mjs';
import { readAuditionResponse } from '../public/audition.mjs';

const apiKey = 'MOCK-SECRET-DO-NOT-LEAK';
const request = { apiKey, prompt: 'Where should the parcel be delivered?' };
function wavFixture() {
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0); wav.writeUInt32LE(38, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(2, 40);
  wav.writeInt16LE(5, 44);
  return wav;
}
async function harness(t, audition) {
  const server = await buildServer({ audition, updater: {} });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(url + '/api/session')).json();
  return { url, post: (body = request, { headers, signal } = {}) => fetch(url + '/api/audition', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mark-session': token, ...headers },
    body: JSON.stringify(body), signal,
  }) };
}

test('authorized browser protocol receives a valid buffered WAV and no API key in headers', async (t) => {
  const bytes = wavFixture();
  let calls = 0;
  const { url, post } = await harness(t, async (args) => {
    calls++;
    assert.equal(args.prompt, request.prompt);
    assert.equal(args.apiKey, apiKey);
    assert.ok(args.signal instanceof AbortSignal);
    return { wav: bytes, transcript: 'not needed by playback' };
  });
  const widget = await fetch(url + '/audition.mjs');
  assert.equal(widget.status, 200);
  assert.match(widget.headers.get('content-security-policy'), /media-src 'self' blob:/);
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok([...response.headers.values()].every((value) => !value.includes(apiKey)));
  const clip = await readAuditionResponse(response);
  assert.equal(clip.type, 'audio/wav');
  assert.deepEqual(Buffer.from(await clip.arrayBuffer()), bytes);
  assert.equal(calls, 1);
});

test('rejects bad input, cross-origin and uninitialized sessions before using a paid provider', async (t) => {
  let calls = 0;
  const { post } = await harness(t, async () => { calls++; throw Error(); });
  assert.equal((await post({ ...request, prompt: '' })).status, 400);
  assert.equal((await post({ ...request, prompt: 'a'.repeat(1201) })).status, 400);
  assert.equal((await post({ ...request, apiKey: 'bad\nheader' })).status, 400);
  assert.equal((await post({ ...request, model: 'https://not-a-model.test' })).status, 400);
  assert.equal((await post(request, { headers: { 'x-mark-session': 'wrong' } })).status, 403);
  assert.equal((await post(request, { headers: { origin: 'https://other-site.test' } })).status, 403);
  assert.equal(calls, 0);
});

test('provider rate limit creates a short cooldown, no fallback, and a usable Retry-After', async (t) => {
  let calls = 0;
  const { post } = await harness(t, async () => {
    calls++;
    throw Object.assign(Error(apiKey), { code: 'GEMINI_LIVE_RATE_LIMIT' });
  });
  const response = await post();
  await assert.rejects(readAuditionResponse(response), (error) => error.status === 429 && error.retryAfter === 15 && !error.message.includes(apiKey));
  const retry = await post();
  assert.equal(retry.status, 429);
  assert.ok(Number(retry.headers.get('retry-after')) > 0);
  assert.equal(calls, 1);
});

test('overlapping take is refused, upstream abort releases the slot, and stale output is never used', async (t) => {
  let calls = 0;
  let start, abortSeen;
  const started = new Promise((resolve) => { start = resolve; });
  const seen = new Promise((resolve) => { abortSeen = resolve; });
  const { post } = await harness(t, async ({ signal }) => {
    calls++;
    if (calls === 1) {
      start();
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      abortSeen();
    }
    return { wav: wavFixture() };
  });
  const controller = new AbortController();
  const first = post(request, { signal: controller.signal });
  const rejects = assert.rejects(first, /abort/i);
  await started;
  assert.equal((await post()).status, 409);
  controller.abort();
  await Promise.all([rejects, seen]);
  assert.equal((await post()).status, 200);
  assert.equal(calls, 2);
});

test('rejects invalid WAV and never forwards a provider error body or message', async (t) => {
  let calls = 0;
  const { post } = await harness(t, async () => {
    if (++calls === 1) return { wav: Buffer.alloc(100) };
    throw Object.assign(Error('Untrusted transport leaked ' + apiKey), { status: 502 });
  });
  assert.match((await (await post()).json()).error, /재생 가능한 WAV/);
  const failed = await post();
  assert.equal(failed.status, 502);
  assert.doesNotMatch((await failed.json()).error, /MOCK-SECRET/);
});
