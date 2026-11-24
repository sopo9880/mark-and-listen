import { app, BrowserWindow, dialog, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../src/server.mjs';

const host = '127.0.0.1';
const port = 4173;
const origin = `http://${host}:${port}`;
const smoke = process.argv.includes('--desktop-smoke');
let server, window;

const appOrigin = url => {
  try { return new URL(url).origin === origin; } catch { return false; }
};

async function listen() {
  const instance = await buildServer();
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen({ host, port, exclusive: true }, () => {
      instance.removeListener('error', reject);
      resolve();
    });
  });
  return instance;
}

async function main() {
  // Bind our own server before opening the window; do not attach to an unknown service on this port.
  server = await listen();
  server.on('error', () => app.quit());
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    title: 'Mark & Listen', width: 1320, height: 900,
    minWidth: 760, minHeight: 580, show: false, backgroundColor: '#101b18',
    icon: fileURLToPath(new URL('./mark-and-listen.png', import.meta.url)),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, devTools: !app.isPackaged,
      partition: 'persist:mark-and-listen',
    },
  });
  const wc = window.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const eventName of ['will-frame-navigate', 'will-redirect']) {
    wc.on(eventName, (event, oldUrl) => {
      if (!appOrigin(event.url ?? oldUrl)) event.preventDefault();
    });
  }
  wc.on('will-attach-webview', event => event.preventDefault());
  // The app renders prebuilt audio and generates tracks in the local backend, without microphone access.
  wc.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  wc.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => { if (!smoke) window?.show(); });
  window.on('closed', () => { window = undefined; });
  await wc.loadURL(origin + '/');

  if (smoke) {
    const result = await wc.executeJavaScript(`(async () => {
      const session = await (await fetch('/api/session')).json();
      const audio = await fetch('/audio/lc1.mp3', {method: 'HEAD'});
      return { origin: location.origin, title: document.title, build: session.build,
        api: typeof session.token === 'string', audio: audio.ok, node: typeof require,
        rendererProcess: typeof process };
    })()`);
    if (result.origin !== origin || !result.title.includes('Mark & Listen') || !result.build ||
        !result.api || !result.audio || result.node !== 'undefined' ||
        result.rendererProcess !== 'undefined') throw Error('Windows wrapper smoke checks failed.');
    console.log(JSON.stringify({ desktopSmoke: true, ...result }));
    app.quit();
  }
}

app.setAppUserModelId('org.markandlisten.desktop');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.whenReady().then(main).catch(error => {
    const message = error.code === 'EADDRINUSE'
      ? '다른 앱이 포트 4173을 사용 중이에요. Mark & Listen의 브라우저판 또는 다른 실행 창을 닫은 다음 다시 열어 주세요.'
      : 'Mark & Listen을 시작하지 못했어요. 설치 파일을 다시 실행하거나, ZIP을 폴더에 모두 푼 뒤 다시 시도해 주세요.';
    if (smoke) console.error(error);
    else dialog.showErrorBox('Mark & Listen', message);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    server?.closeAllConnections();
    server?.close();
  });
}
