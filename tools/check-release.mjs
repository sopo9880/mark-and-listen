// Offline release integrity check. Does not run any Windows executable or make network calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function argsFrom(argv) {
  const supported = new Set(['--installer', '--portable', '--stage']);
  assert.equal(argv.length % 2, 0, 'Use --installer <exe>, --portable <zip>, and/or --stage <directory>');
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(supported.has(argv[i]), `Unknown option ${argv[i]}`);
    assert.ok(!Object.hasOwn(out, argv[i]), `Repeated option ${argv[i]}`);
    out[argv[i]] = resolve(argv[i + 1]);
  }
  return out;
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

function verifyPE(buffer) {
  assert.ok(buffer.length >= 128, 'truncated DOS/PE header');
  assert.equal(buffer.toString('ascii', 0, 2), 'MZ');
  const pe = buffer.readUInt32LE(0x3c);
  assert.ok(pe >= 0x40 && pe + 94 <= buffer.length, 'invalid or truncated PE header offset');
  assert.deepEqual([...buffer.subarray(pe, pe + 4)], [0x50, 0x45, 0, 0]);
  function check(label, expected, actual) { assert.equal(actual, expected, label); }
  check('AMD64 machine architecture', 0x8664, buffer.readUInt16LE(pe + 4));
  check('executable image', 2, buffer.readUInt16LE(pe + 22) & 2);
  check('not a dynamic library', 0, buffer.readUInt16LE(pe + 22) & 0x2000);
  check('64-bit PE32+ optional header', 0x20b, buffer.readUInt16LE(pe + 24));
  check('GUI subsystem', 2, buffer.readUInt16LE(pe + 24 + 68));
}

async function executable(path, minimumSize) {
  const size = (await stat(path)).size;
  assert.ok(size >= minimumSize, `unexpectedly small EXE: ${path}`);
  const buffer = Buffer.alloc(16384);
  const handle = await open(path);
  try {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    verifyPE(buffer.subarray(0, bytesRead));
  } finally { await handle.close(); }
  return { path, bytes: size, sha256: await sha256(path), architecture: 'Windows x64 PE32+' };
}

const payloadNames = [
  'Mark-and-Listen.exe', 'resources/app/package.json', 'resources/app/desktop/main.mjs',
  'resources/app/public/index.html', 'resources/app/public/app.mjs', 'resources/app/public/full-session.mjs',
  'resources/app/public/full-exam.mjs', 'resources/app/public/full-lc.mjs', 'resources/app/public/full-rc.mjs',
  'resources/app/src/server.mjs',
];

function verifyPayloadNames(names) {
  for (const name of names) {
    const segs = name.split('/');
    assert.ok(!name.startsWith('/') && !name.includes('\\') && !/^[A-Za-z]:/.test(name) &&
      !segs.includes('..'), `unsafe archive path: ${name}`);
    assert.ok(!segs.some(x => /^(?:\.env(?:\..*)?|auth\.json|codex(?:\.exe|\.cmd|\.ps1)|\.git)$/i.test(x)),
      `a local credential/runtime file should not ship: ${name}`);
  }
  for (const relativePath of payloadNames) {
    const found = names.filter(name => name === relativePath || name.endsWith('/' + relativePath));
    assert.equal(found.length, 1, `portable payload missing or duplicates ${relativePath}`);
  }
  const tracks = names.filter(name => /(?:^|\/)resources\/app\/public\/audio\/full-lc\/p[1-4]-[0-9]{2}\.mp3$/.test(name));
  assert.equal(tracks.length, 54, 'expected 54 bundled LC audio files');
  const visuals = names.filter(name => /(?:^|\/)resources\/app\/public\/full-lc-images\/[a-z0-9-]+\.svg$/.test(name));
  assert.ok(visuals.length >= 6, 'expected at least 6 bundled LC visual assets');
  return { audioTracks: tracks.length, visualAssets: visuals.length };
}

function unzip(args) {
  const r = spawnSync('unzip', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `unzip ${args[0]} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

async function verifyStage(path) {
  const files = async directory => (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(item => item.isFile()).map(item =>
      resolve(item.parentPath, item.name).slice(directory.length + 1).replaceAll('\\', '/')).sort();
  const names = await files(path);
  const counts = verifyPayloadNames(names);
  const bundle = resolve(path, 'resources/app');
  const expected = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const bundled = JSON.parse(await readFile(resolve(bundle, 'package.json'), 'utf8'));
  assert.equal(bundled.name, expected.name);
  assert.equal(bundled.version, expected.version);
  assert.equal(bundled.main, 'desktop/main.mjs');
  let matchedSourceFiles = 0;
  for (const directory of ['public', 'src', 'desktop']) {
    const expectedNames = directory === 'desktop'
      ? ['main.mjs','mark-and-listen.ico','mark-and-listen.png']
      : await files(resolve(root,directory));
    assert.deepEqual(await files(resolve(bundle,directory)), expectedNames, `staged ${directory} file list differs`);
    for (const name of expectedNames) {
      const relative = directory + '/' + name;
      assert.equal(await sha256(resolve(bundle, relative)), await sha256(resolve(root, relative)), `stale staged bytes: ${relative}`);
      matchedSourceFiles++;
    }
  }
  return { files: names.length, matchedSourceFiles, version: bundled.version, ...counts,
    exe: await executable(resolve(path, 'Mark-and-Listen.exe'), 1024 * 1024) };
}

async function verifyPortable(path) {
  // unzip performs the CRC read via its test mode, without extracting any paths.
  const names = unzip(['-Z1', path]).trim().split(/\r?\n/).filter(n => n && !n.endsWith('/'));
  assert.equal(new Set(names).size, names.length, 'Duplicate path in portable ZIP');
  const counts = verifyPayloadNames(names);
  unzip(['-tq', path]);
  return { path, bytes: (await stat(path)).size, entries: names.length, ...counts, sha256: await sha256(path) };
}

try {
  const args = argsFrom(process.argv.slice(2));
  assert.ok(Object.keys(args).length, 'Specify at least one actual release artifact');
  const results = {};
  if (args['--stage']) results.stage = await verifyStage(args['--stage']);
  if (args['--portable']) results.portable = await verifyPortable(args['--portable']);
  if (args['--installer']) results.installer = await executable(args['--installer'], 1024 * 1024);
  console.log(JSON.stringify({ ok: true, ...results, windowsRuntimeTested: false }, null, 2));
} catch (error) {
  console.error(`Release check failed: ${error.message}`);
  process.exitCode = 1;
}
