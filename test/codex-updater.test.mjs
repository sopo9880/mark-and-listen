import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { createCodexUpdater } from '../src/codex-updater.mjs';

const pkg = 'https://registry.npmjs.org/@openai/codex';
const first = '0.170.0', next = '0.172.0';
const exe = 'package/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const runner = 'package/vendor/x86_64-pc-windows-msvc/codex-resources/codex-command-runner.exe';
const sri = b => 'sha512-' + createHash('sha512').update(b).digest('base64');
const tarUrl = v => `${pkg}/-/codex-${v}-win32-x64.tgz`;

function tarGz(entries) {
  const out = [];
  for (const [name, data, type = '0'] of entries) {
    const content = Buffer.from(data);
    const h = Buffer.alloc(512);
    h.write(name, 0, 'ascii');
    h.write('0000755\0', 100);
    h.write(content.length.toString(8).padStart(11, '0') + '\0', 124);
    h.fill(32, 148, 156);
    h.write(type, 156);
    h.write('ustar\0', 257);
    h.write(h.reduce((sum, b) => sum + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    out.push(h, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...out, Buffer.alloc(1024)]));
}

async function setup(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mark-codex-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const packages = {
    [first]: tarGz([[exe, first], [runner, 'sandbox helper'], ['../ignored.exe', 'ignored']]),
    [next]: tarGz([[exe, next]]),
  };
  const changes = { latest: next };
  const calls = [], verified = [];
  const metadata = version => ({
    name: '@openai/codex', version: version + '-win32-x64', os: ['win32'], cpu: ['x64'],
    dist: { tarball: tarUrl(version), integrity: sri(packages[version]) },
  });
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    calls.push(url);
    if (url === pkg + '/latest') return Response.json({ name: '@openai/codex', version: changes.latest });
    for (const version of [first, next]) {
      if (url === pkg + '/' + version + '-win32-x64') {
        const meta = metadata(version);
        return Response.json(changes.metadata ? changes.metadata(meta) : meta);
      }
      if (url === tarUrl(version)) {
        if (changes.beforeDownload) await changes.beforeDownload;
        return new Response(changes.corrupt ? 'bad bytes' : packages[version]);
      }
    }
    assert.fail(`Unexpected request to ${url}`);
  };
  const verify = async (file, version, home) => {
    verified.push(version);
    assert.equal(await readFile(file, 'utf8'), version);
    assert.deepEqual(await readdir(home), []);
    assert.equal(file.includes('stage-'), true);
    if (changes.probeReject) throw new Error('test runtime rejects');
  };
  const updater = createCodexUpdater({
    root, platform: 'win32', arch: 'x64', fetcher, verify,
    pinnedIntegrity: sri(packages[first]), ...options,
  });
  return { root, updater, calls, packages, changes, verified };
}

test('offline status and explicit stable check never download or launch a binary', async t => {
  const { updater, calls } = await setup(t);
  assert.deepEqual(await updater.status(), {
    supported: true, platform: 'win32-x64', pinned: first, installed: null, previous: null, busy: false,
  });
  assert.equal(await updater.executable(), null);
  assert.deepEqual(calls, []);
  assert.deepEqual(await updater.check(), { latest: next, installed: null, newer: true });
  assert.deepEqual(calls, [pkg + '/latest']);
});

test('pinned install uses allowlisted archive paths; latest and rollback preserve verified old runtime', async t => {
  const { updater, root, changes, calls } = await setup(t);
  let status = await updater.install('pinned');
  assert.equal(status.installed, first);
  const firstPath = await updater.executable();
  const releaseDir = dirname(dirname(firstPath));
  assert.equal(await readFile(join(releaseDir, 'codex-resources', 'codex-command-runner.exe'), 'utf8'), 'sandbox helper');
  assert.equal(await readFile(firstPath, 'utf8'), first);
  await assert.rejects(readFile(join(root, 'ignored.exe')), { code: 'ENOENT' });
  assert.equal(calls.includes(pkg + '/latest'), false);
  status = await updater.install('latest');
  assert.equal(status.installed, next);
  assert.equal(status.previous, first);
  assert.notEqual(await updater.executable(), firstPath);
  changes.latest = first;
  assert.equal((await updater.check()).newer, false);
  assert.equal((await updater.install('latest')).installed, next);
  assert.equal((await updater.rollback()).installed, first);
  assert.equal(await updater.executable(), firstPath);
  assert.equal((await updater.rollback()).installed, next);
});

test('checksum rejection and failed probe do not move installed executable or leave stage directories', async t => {
  const { updater, root, changes, verified } = await setup(t);
  await updater.install();
  const active = await updater.executable();
  changes.corrupt = true;
  await assert.rejects(updater.install('latest'), /SHA-512/);
  assert.deepEqual(verified, [first]);
  assert.equal(await updater.executable(), active);
  changes.corrupt = false;
  changes.probeReject = true;
  await assert.rejects(updater.install('latest'), /test runtime rejects/);
  assert.equal(await updater.executable(), active);
  assert.deepEqual((await readdir(root)).sort(), ['active.json', 'versions']);
  assert.equal((await readdir(join(root, 'versions'))).length, 1);
});

test('a known version cannot get a new integrity pin from mutable registry metadata', async t => {
  const { updater, calls, packages } = await setup(t);
  packages[first] = tarGz([[exe, 'replaced']]);
  await assert.rejects(updater.install('pinned'), /지문/);
  assert.deepEqual(calls, [pkg + '/' + first + '-win32-x64']);
});

test('wrong metadata, prerelease and arbitrary install target fail before any archive request', async t => {
  const { updater, calls, changes } = await setup(t);
  await assert.rejects(updater.install('https://example.invalid/anything'), /pinned 또는 latest/);
  changes.latest = '0.173.0-alpha.1';
  await assert.rejects(updater.check(), /안정 버전/);
  changes.metadata = m => ({ ...m, dist: { ...m.dist, tarball: 'https://example.invalid/evil' } });
  await assert.rejects(updater.install('pinned'), /배포 정보/);
  assert.equal(calls.length, 2);
  assert.equal(await updater.executable(), null);
});

test('a colliding tar symlink or repeated allowlisted executable is not staged or activated', async t => {
  const { updater, changes, packages } = await setup(t);
  for (const entries of [[[exe, 'bad', '2']], [[exe, next], [exe, 'replaced']]]) {
    packages[next] = tarGz(entries);
    changes.latest = next;
    await assert.rejects(updater.install('latest'), /압축 항목/);
    assert.equal(await updater.executable(), null);
  }
});

test('concurrent instances cannot install or roll back over an in-flight update', async t => {
  const { updater, root, changes } = await setup(t);
  await updater.install();
  const contender = createCodexUpdater({ root, platform: 'win32', arch: 'x64' });
  let proceed;
  changes.beforeDownload = new Promise(r => { proceed = r; });
  const pending = updater.install('latest');
  try {
    for (let tries = 0; tries < 200 && !(await contender.status()).busy; tries++) {
      await new Promise(r => setTimeout(r, 2));
    }
    assert.equal((await contender.status()).busy, true);
    assert.equal((await contender.status()).installed, first);
    await assert.rejects(contender.rollback(), /다른 실행/);
    await assert.rejects(updater.rollback(), /이미 진행/);
  } finally { proceed(); }
  assert.equal((await pending).installed, next);
  assert.equal((await contender.status()).busy, false);
});

test('unavailable platform reports offline status and refuses update without networking', async t => {
  const { updater, calls } = await setup(t, { platform: 'linux' });
  assert.equal((await updater.status()).supported, false);
  assert.equal(await updater.executable(), null);
  await assert.rejects(updater.install(), /Windows x64/);
  await assert.rejects(updater.check(), /Windows x64/);
  await assert.rejects(updater.rollback(), /Windows x64/);
  assert.deepEqual(calls, []);
});

test('default compatibility probe spawns only --version in a temporary isolated home', {
  skip: process.platform === 'win32' ? 'native Windows PE exercise requires Windows Codex package' : false,
}, async t => {
  const { updater, packages } = await setup(t, { verify: undefined });
  const script = [
    '#!/bin/sh',
    '[ "$#" = 1 ] && [ "$1" = --version ] || exit 21',
    '[ "$CODEX_HOME" = "$PWD" ] && [ "$HOME" = "$PWD" ] || exit 22',
    '[ "$OPENAI_API_KEY" = "" ] || exit 23',
    `printf '%s\\n' 'codex-cli ${next}'`,
  ].join('\n') + '\n';
  packages[next] = tarGz([[exe, script]]);
  assert.equal((await updater.install('latest')).installed, next);
});
