import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildServer } from '../src/server.mjs';

test('MP3 range responses serve exact bytes and reject unsupported or out-of-bounds ranges', async (t) => {
  const server = await buildServer({ updater: {} });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const file = await readFile(new URL('../public/audio/lc1.mp3', import.meta.url));
  const seek = async (range, method = 'GET') => {
    const res = await fetch(base + '/audio/lc1.mp3', { method, headers: { range } });
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, res };
  };
  const exact = await seek('bytes=11-40');
  assert.equal(exact.res.status, 206);
  assert.equal(exact.res.headers.get('accept-ranges'), 'bytes');
  assert.equal(exact.res.headers.get('content-range'), `bytes 11-40/${file.length}`);
  assert.equal(exact.res.headers.get('content-length'), '30');
  assert.deepEqual(exact.bytes, file.subarray(11, 41));

  const suffix = await seek('bytes=-19');
  assert.equal(suffix.res.status, 206);
  assert.deepEqual(suffix.bytes, file.subarray(-19));
  const tail = await seek(`bytes=${file.length - 2}-`);
  assert.equal(tail.res.status, 206);
  assert.deepEqual(tail.bytes, file.subarray(-2));
  const endClamped = await seek(`bytes=${file.length - 2}-${file.length + 999}`);
  assert.equal(endClamped.res.status, 206);
  assert.deepEqual(endClamped.bytes, file.subarray(-2));

  for (const range of ['bytes=7-3', 'bytes=0-2,5-9', `bytes=${file.length}-`, 'bytes=-0', 'bytes=-']) {
    const bad = await seek(range);
    assert.equal(bad.res.status, 416, range);
    assert.equal(bad.res.headers.get('content-range'), `bytes */${file.length}`);
    assert.equal(bad.bytes.length, 0);
  }
  const head = await seek('bytes=0-2', 'HEAD');
  assert.equal(head.bytes.length, 0);
  const html = await fetch(base + '/', { headers: { range: 'bytes=0-2' } });
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('content-range'), null);
  await html.text();
});
