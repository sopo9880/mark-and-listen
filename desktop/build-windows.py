#!/usr/bin/env python3
"""Package a self-contained Windows x64 app and, with NSIS 3.11+, an installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
ELECTRON = '45.4.1'
RUNTIME = f'electron-v{ELECTRON}-win32-x64.zip'
RUNTIME_SHA = '2ba6223afa9121f42831fefe92c434334907540165294fc56697449d12e7cfe9'
RELEASE = f'https://github.com/electron/electron/releases/download/v{ELECTRON}'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def require_x64_exe(path):
    with path.open('rb') as stream:
        assert stream.read(2) == b'MZ', f'{path.name}: no DOS header'
        stream.seek(0x3c)
        offset = struct.unpack('<I', stream.read(4))[0]
        stream.seek(offset)
        assert stream.read(6) == b'PE\0\0\x64\x86', f'{path.name}: not a Windows x64 PE'

def runtime_stage(archive, stage):
    if digest(archive) != RUNTIME_SHA:
        raise RuntimeError('Official Electron runtime SHA-256 does not match the pin.')
    with ZipFile(archive) as f:
        for entry in f.infolist():
            name = PurePosixPath(entry.filename)
            if name.is_absolute() or '..' in name.parts or '\\' in entry.filename or ':' in entry.filename:
                raise ValueError('Unexpected Electron archive path')
            if entry.filename != 'resources/default_app.asar':
                f.extract(entry, stage)
    exe = stage / 'Mark-and-Listen.exe'
    (stage / 'electron.exe').rename(exe)
    require_x64_exe(exe)

def app_stage(stage):
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf8'))
    raw = package['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+-[0-9]+', raw):
        raise ValueError('Expecting build version in dotted hyphen semver (e.g. 0.0.0-2).')
    version = raw.replace('-', '.')
    for part in version.split('.'):
        if int(part) > 65535:
            raise ValueError('Windows version component exceeds version resource maximum')
    app = stage / 'resources' / 'app'
    app.mkdir(parents=True)
    shutil.copytree(ROOT / 'public', app / 'public')
    shutil.copytree(ROOT / 'src', app / 'src')
    desktop = app / 'desktop'
    desktop.mkdir()
    for name in ['main.mjs', 'mark-and-listen.png', 'mark-and-listen.ico']:
        shutil.copyfile(ROOT / 'desktop' / name, desktop / name)
    release = {'name': 'mark-and-listen', 'productName': 'Mark & Listen',
               'version': raw, 'main': 'desktop/main.mjs', 'type': 'module', 'private': True}
    (app / 'package.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf8')
    shutil.copyfile(ROOT / 'README.md', stage / 'README.md')
    return version

def make_portable(stage, target):
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=5) as archive:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                archive.write(path, f'Mark-and-Listen/{path.relative_to(stage).as_posix()}')

def make_setup(stage, target, nsis, version):
    subprocess.run([
        nsis, '-V2', f'-DOUTPUT={target}', f'-DSTAGE={stage}',
        f'-DICON={ROOT / "desktop" / "mark-and-listen.ico"}',
        f'-DAPP_VERSION={version}', str(ROOT / 'desktop' / 'installer.nsi'),
    ], check=True)
    require_x64_exe(target)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--electron-zip', type=Path, help=f'Use an existing verified {RUNTIME}.')
    p.add_argument('--out', type=Path, default=ROOT / 'dist' / 'windows')
    p.add_argument('--makensis', default=shutil.which('makensis'))
    p.add_argument('--portable', action='store_true', help='Also create a portable ZIP (always if NSIS unavailable).')
    p.add_argument('--keep-stage', type=Path, help='Save extracted application sidecars here for QA.')
    args = p.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='mark-and-listen-build-', dir=out) as temp:
        work = Path(temp)
        arc = args.electron_zip
        if not arc:
            arc = work / RUNTIME
            subprocess.run(['curl', '-fLsS', '--max-time', '300', f'{RELEASE}/{RUNTIME}', '-o', str(arc)], check=True)
        stage = work / 'stage'
        stage.mkdir()
        runtime_stage(arc, stage)
        version = app_stage(stage)
        name = f'Mark-and-Listen-{version}-Windows-x64'
        targets = []
        if args.makensis:
            path = work / f'{name}-Setup.exe'
            make_setup(stage, path, args.makensis, version)
            targets.append(path)
        if args.portable or not args.makensis:
            path = work / f'{name}-Portable.zip'
            make_portable(stage, path)
            targets.append(path)
        if args.keep_stage:
            shutil.copytree(stage, args.keep_stage)
        for target in targets:
            final = out / target.name
            os.replace(target, final)
            print(f'{final} ({final.stat().st_size:,} bytes) SHA-256 {digest(final)}', flush=True)

if __name__ == '__main__':
    main()
