# Desktop build
The Windows build bundles the official Electron runtime, this app, and the offline exam MP3s. It does not bundle Codex, a separate Node installer, credentials, or generated user files.

Build with Python 3.11+, curl and NSIS 3.11+:
```sh
python desktop/build-windows.py --out dist/windows --makensis /path/to/makensis
```

Add `--portable` to also produce a ZIP. On a machine without NSIS, the script produces a portable ZIP instead. Extract it entirely before opening `Mark-and-Listen.exe`; keep the EXE and its sidecars together. To build offline, supply the audited Electron v45.4.1 archive via `--electron-zip`. The script verifies its pinned SHA-256 and checks both payload app and setup are AMD64 PE files.

Setup installs for the current user under `%LOCALAPPDATA%\Programs\Mark and Listen`; it creates a Start menu shortcut and can be uninstalled in Windows Settings. It does not delete exam history/settings or the separate app-managed Codex on uninstall. The setup is not signed by the project. Do not run a copy from an untrusted source.

The desktop app uses its own persistent Electron profile, separate from Chrome/Edge's site storage. Its frontend is served only by the app-owned `127.0.0.1:4173`; if the development server or another app already owns that port, close it before launching. AI providers require their own login/key/network as documented.

Runtime: [Electron 45.4.1](https://github.com/electron/electron/releases/tag/v45.4.1). The official Electron and Chromium runtime licenses are retained beside the executable.
