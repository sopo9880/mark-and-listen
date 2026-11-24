#!/usr/bin/env python3
"""Unpack NSIS and verify the installed code and assets against the source checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def require_x64_gui(path):
    with path.open('rb') as stream:
        if stream.read(2) != b'MZ':
            raise ValueError('No MZ header: ' + str(path))
        stream.seek(0x3c)
        stream.seek(struct.unpack('<I', stream.read(4))[0])
        if stream.read(6) != b'PE\0\0\x64\x86':
            raise ValueError('Not an AMD64 PE: ' + str(path))
        stream.seek(18, 1)
        optional_header = stream.read(70)
        if (struct.unpack_from('<H', optional_header, 0)[0], struct.unpack_from('<H', optional_header, 68)[0]) != (0x20b, 2):
            raise ValueError('Not a PE32+ GUI application: ' + str(path))

def main():
    p = argparse.ArgumentParser()
    p.add_argument('setup', type=Path)
    p.add_argument('--7zip', default=shutil.which('7z') or '7z')
    p.add_argument('--http-smoke', action='store_true', help='Exercise the extracted app server with Node.')
    args = p.parse_args()
    require_x64_gui(args.setup)
    with tempfile.TemporaryDirectory(prefix='mark-pe-verify-') as t:
        out = Path(t)
        subprocess.run([getattr(args, '7zip'), 'x', '-y', '-bd', '-bso0', str(args.setup.resolve()), f'-o{out}'], check=True)
        require_x64_gui(out / 'Mark-and-Listen.exe')
        for asset in ['icudtl.dat','resources.pak','ffmpeg.dll','LICENSE','LICENSES.chromium.html']:
            if not (out / asset).is_file():
                raise FileNotFoundError('Missing runtime ' + asset)
        app = out / 'resources' / 'app'
        manifest = json.loads((app / 'package.json').read_text())
        expected = json.loads((ROOT / 'package.json').read_text())['version']
        if manifest.get('version') != expected or manifest.get('main') != 'desktop/main.mjs':
            raise ValueError('Incorrect app manifest')
        origins = [p for base in ['public','src'] for p in (ROOT / base).rglob('*') if p.is_file()]
        origins.extend(ROOT / 'desktop' / name for name in ('main.mjs','mark-and-listen.png','mark-and-listen.ico'))
        for src in origins:
            dest = app / src.relative_to(ROOT)
            if not dest.is_file() or digest(dest) != digest(src):
                raise ValueError(f'Stale or missing packaged file: {src.relative_to(ROOT)}')
        if args.http_smoke:
            script = """
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {buildServer} = await import(pathToFileURL(process.argv[2]));
const server = await buildServer();
await new Promise((resolve, reject) => {
  server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const root = await fetch(base); assert.equal(root.status, 200);
  assert.match(await root.text(), /Mark &amp; Listen/);
  const session = await (await fetch(base + '/api/session')).json();
  assert.equal(session.build, process.argv[3]); assert.equal(typeof session.token, 'string');
  for (const path of ['/app.mjs', '/full-exam.mjs', '/full-lc.mjs', '/full-lc-layout.mjs',
                      '/full-lc-source.mjs', '/full-lc-timings.mjs', '/full-rc.mjs']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path); await r.text();
  }
  const audio = await fetch(base + '/audio/full-lc/p1-01.mp3');
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.ok((await audio.arrayBuffer()).byteLength > 1000);
  console.log('Extracted backend served build ' + session.build + ', full test modules and offline MP3.');
} finally { server.closeAllConnections(); server.close(); }
"""
            subprocess.run(['node','--input-type=module','-e',script,'packaged-http-probe',str(app / 'src' / 'server.mjs'),
                            expected.replace('-', '.')], check=True, timeout=20)
        print(f'Windows x64 GUI setup + app verified ({expected}); {len(origins)} files match the current source, including {len(list((app / "public" / "audio").rglob("*.mp3")))} MP3s.')
        print(f'Setup SHA-256 {digest(args.setup)}')

if __name__ == '__main__':
    main()
