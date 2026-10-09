const { app, BrowserWindow, Menu, protocol, shell, dialog, ipcMain, nativeTheme, Notification } = require('electron');
const { fork, execFile } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const { buildMenu } = require('./menu');

const REPO_URL = 'https://github.com/tet0r/media-catalog';

// The app is not a web server and opens no network port. Its window loads
// from this private scheme, and the one thing that answers it is the engine
// (below), reached over a named pipe that only this app knows the name of.
// A fixed scheme + host also means a stable origin, so things the page
// remembers (like the chosen theme) are never lost between launches.
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://media-catalog`;
const PIPE_PATH = `\\\\.\\pipe\\media-catalog-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;

// Must be registered before the app is ready. "standard" + "secure" is what
// lets the page use localStorage, fetch and history routing like any site.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// --smoke-test[=result.json] [--screenshot=file.png]: start everything,
// load the real UI, check it, write the result and exit. Used to verify a
// build (including a packaged one) without anyone looking at the window.
const smokeArg = process.argv.find((a) => a === '--smoke-test' || a.startsWith('--smoke-test='));
const SMOKE = !!smokeArg;
const SMOKE_OUT = smokeArg && smokeArg.includes('=') ? smokeArg.split('=').slice(1).join('=') : null;
const screenshotArg = process.argv.find((a) => a.startsWith('--screenshot='));
const SCREENSHOT = screenshotArg ? screenshotArg.split('=').slice(1).join('=') : null;

// A second launch just focuses the first window (see 'second-instance').
// Smoke tests skip the lock so they can run beside a normal session.
const gotLock = SMOKE || app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.setAppUserModelId('com.tet0r.mediacatalog');

// ---- where everything lives -------------------------------------------
// Installed: under the user's roaming app data (%APPDATA%/Media Catalog).
// Portable: beside the .exe, so the whole thing can be carried around —
// electron-builder's portable launcher tells us where via
// PORTABLE_EXECUTABLE_DIR. If that spot isn't writable, fall back to the
// installed layout rather than failing to start.
function resolveLayout() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    const root = path.join(portableDir, 'MediaCatalogData');
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.accessSync(root, fs.constants.W_OK);
      return { root, portable: true, userData: path.join(root, 'browser') };
    } catch {
      /* not writable — use the installed layout */
    }
  }
  // Chromium's own cache/storage goes in a subfolder so the root holds just
  // the things a person cares about: data/, backups/, logs/.
  const root = app.getPath('userData');
  return { root, portable: false, userData: path.join(root, 'browser') };
}

const layout = resolveLayout();
app.setPath('userData', layout.userData);
const DATA_DIR = path.join(layout.root, 'data');
const BACKUP_DIR = path.join(layout.root, 'backups');
const LOG_DIR = path.join(layout.root, 'logs');
for (const dir of [DATA_DIR, BACKUP_DIR, LOG_DIR]) fs.mkdirSync(dir, { recursive: true });

const ICON = path.join(__dirname, 'build', 'icon.ico');
const SERVER_DIR = path.join(__dirname, 'app-server');
const VERSION = (() => {
  try {
    return fs.readFileSync(path.join(SERVER_DIR, 'VERSION'), 'utf8').trim();
  } catch {
    return app.getVersion();
  }
})();

let win = null;
let engineProc = null;
let quitting = false;
let restartTimes = [];
let themeMode = 'dark';

// ---- window geometry, remembered between launches ----------------------
const STATE_FILE = path.join(layout.root, 'window-state.json');
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    /* best effort */
  }
}

// ---- the engine -----------------------------------------------------------
// The same Express code the Docker image runs, as a hidden helper process
// (Electron's own binary acting as plain Node). It listens on a private
// named pipe, not a port. It's a separate process rather than living inside
// the window's own because scans of large or networked folders read the disk
// synchronously — inside the main process that would freeze the window, its
// menus and its title bar ("Not Responding") until the scan finished.
function spawnEngine() {
  return new Promise((resolve, reject) => {
    const entry = path.join(SERVER_DIR, 'index.js');
    if (!fs.existsSync(entry)) {
      reject(new Error(`Bundled engine not found at ${entry}. Run "npm run prepare-app" in desktop/ first.`));
      return;
    }
    const child = fork(entry, [], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        MEDIA_CATALOG_DESKTOP: '1',
        NODE_ENV: 'production',
        LISTEN_PIPE: PIPE_PATH,
        DATA_DIR,
        BACKUP_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const log = fs.createWriteStream(path.join(LOG_DIR, 'server.log'), { flags: 'a' });
    log.write(`\n--- ${new Date().toISOString()} starting engine ---\n`);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('The engine did not start within 30 seconds'));
    }, 30000);
    child.once('message', (m) => {
      if (m && m.type === 'ready') {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`The engine exited during startup (code ${code}, signal ${signal})`));
    });
  });
}

async function startEngine() {
  // A few attempts: the native SQLite module has been seen to fail to load
  // sporadically on some Windows setups, and a retry is all it takes.
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const child = await spawnEngine();
      child.removeAllListeners('exit');
      child.on('exit', onEngineExit);
      return child;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function onEngineExit(code) {
  if (quitting) return;
  const now = Date.now();
  restartTimes = restartTimes.filter((t) => now - t < 60000);
  restartTimes.push(now);
  if (restartTimes.length > 3) {
    dialog.showErrorBox('Media Catalog', `The background engine keeps stopping (exit code ${code}).\n\nLogs: ${LOG_DIR}`);
    quitting = true;
    app.quit();
    return;
  }
  try {
    engineProc = await startEngine();
  } catch (err) {
    dialog.showErrorBox('Media Catalog', `The background engine stopped and could not be restarted.\n\n${err.message}\n\nLogs: ${LOG_DIR}`);
    quitting = true;
    app.quit();
  }
}

// ---- app:// -> the engine -----------------------------------------------------
// Every request the window makes (the page, /api/..., poster images) arrives
// here and is passed straight through to the engine over the pipe, with
// bodies streamed both ways — nothing is buffered, so big exports and
// image uploads cost no extra memory.
const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade']);

function proxyToEngine(request) {
  return new Promise((resolve) => {
    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key)) headers[key] = value;
    });
    const upstream = http.request(
      { socketPath: PIPE_PATH, path: url.pathname + url.search, method: request.method, headers },
      (res) => {
        const out = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (HOP_BY_HOP.has(key) || value === undefined) continue;
          if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
          else out.set(key, String(value));
        }
        const bodyless = request.method === 'HEAD' || [204, 205, 304].includes(res.statusCode);
        resolve(new Response(bodyless ? null : Readable.toWeb(res), { status: res.statusCode, headers: out }));
      }
    );
    upstream.on('error', (err) => {
      resolve(new Response(JSON.stringify({ error: `Engine unavailable: ${err.message}` }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }));
    });
    if (request.body) Readable.fromWeb(request.body).pipe(upstream);
    else upstream.end();
  });
}

// ---- the menu's own calls to the engine ---------------------------------
// Menu actions (scan, back up, export) reach the engine the same way the
// page does, just without going through a window.
function engineRequest(method, route) {
  return new Promise((resolve) => {
    const req = http.request({ socketPath: PIPE_PATH, path: route, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.end();
  });
}

async function apiPost(route) {
  return (await engineRequest('POST', route)).status; // 202 started, 409 already running
}

function notify(body) {
  if (SMOKE) return;
  try {
    new Notification({ title: 'Media Catalog', body }).show();
  } catch {
    /* notifications unavailable */
  }
}

const SCAN_ROUTES = [
  '/api/scan', '/api/tv-scan', '/api/audiobook-scan', '/api/comic-scan', '/api/ebook-scan',
  '/api/album-scan', '/api/vinyl/sync', '/api/games/sync',
];

const actions = {
  async scanAll() {
    const results = await Promise.all(SCAN_ROUTES.map(apiPost));
    const started = results.filter((s) => s === 202).length;
    notify(started ? `Started ${started} library scan${started === 1 ? '' : 's'}.` : 'Scans are already running.');
  },
  async backUp() {
    const s = await apiPost('/api/backups');
    notify(s === 202 ? 'Backup started.' : s === 409 ? 'A backup is already running.' : 'Could not start a backup.');
  },
  async exportText() {
    const s = await apiPost('/api/exports/text');
    notify(s === 202 ? 'Text export started.' : s === 409 ? 'A text export is already running.' : 'Could not start the export.');
  },
  async exportHtml() {
    const s = await apiPost('/api/exports/html');
    notify(s === 202 ? 'HTML export started.' : s === 409 ? 'An HTML export is already running.' : 'Could not start the export.');
  },
  openExports() {
    const dir = path.join(BACKUP_DIR, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  },
  openData() {
    shell.openPath(layout.root);
  },
  navigate(route) {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('desktop:navigate', route);
    }
  },
  setTheme(mode) {
    if (win && !win.isDestroyed()) win.webContents.send('desktop:theme', mode);
  },
  about() {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'About Media Catalog',
      message: `Media Catalog ${VERSION}`,
      detail:
        `Self-hosted media collection cataloger.\n\n` +
        `Your data: ${layout.root}${layout.portable ? ' (portable)' : ''}\n\n` +
        `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
      buttons: ['OK'],
      icon: ICON,
    });
  },
  openExternal(url) {
    shell.openExternal(url);
  },
};

function applyMenu() {
  Menu.setApplicationMenu(buildMenu({ actions, themeMode, repoUrl: REPO_URL }));
}

function setNativeTheme(mode) {
  themeMode = ['system', 'light', 'dark'].includes(mode) ? mode : 'dark';
  nativeTheme.themeSource = themeMode;
  applyMenu();
}

// ---- IPC from the page (see preload.js) -------------------------------
ipcMain.handle('desktop:choose-folder', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a folder',
    properties: ['openDirectory'],
  });
  return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
});
ipcMain.on('desktop:set-theme', (_e, mode) => setNativeTheme(mode));

// ---- the window ----------------------------------------------------------
const SPLASH =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<body style="margin:0;background:#14161a;color:#9a9ea6;font:16px -apple-system,Segoe UI,sans-serif;' +
      'display:flex;align-items:center;justify-content:center;height:100vh">Starting Media Catalog…</body>'
  );

function isWebUrl(url) {
  return /^https?:\/\//i.test(url);
}

function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width || 1360,
    height: state.height || 860,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: !SMOKE,
    title: 'Media Catalog',
    icon: ICON,
    backgroundColor: '#14161a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();

  win.loadURL(SPLASH);

  // The app is only ever its own app:// pages — anything else (TMDB
  // links, the GitHub changelog, ...) opens in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    if (url.startsWith('data:')) return;
    event.preventDefault();
    if (isWebUrl(url)) shell.openExternal(url);
  });

  win.on('close', saveWindowState);
  win.on('closed', () => {
    win = null;
  });
}

// Every TCP port being listened on by this app or any process it started
// (the engine, Chromium's helpers). Expected to be none — that's the whole
// point of the app:// + pipe design — and the smoke test asserts it.
function listeningTcpPorts() {
  return new Promise((resolve) => {
    const pids = new Set(app.getAppMetrics().map((m) => m.pid));
    pids.add(process.pid);
    if (engineProc && engineProc.pid) pids.add(engineProc.pid);
    execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const found = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)$/i);
        if (m && pids.has(Number(m[2]))) found.push(`${m[1]} (pid ${m[2]})`);
      }
      resolve(found);
    });
  });
}

async function smokeCheck() {
  const result = { ok: false };
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const page = JSON.parse(
      await win.webContents.executeJavaScript(`JSON.stringify({
        hasDesktopBridge: !!(window.desktop && window.desktop.chooseFolder),
        title: document.title,
        theme: document.documentElement.dataset.theme,
        rendered: !!(document.getElementById('root') && document.getElementById('root').children.length),
        url: location.href
      })`)
    );
    const health = (await engineRequest('GET', '/api/health')).json;
    const settings = (await engineRequest('GET', '/api/settings')).json;
    // The point of this build: nothing is listening on any TCP port.
    const listening = await listeningTcpPorts();

    // Drive the same code paths the native menu uses: File > Settings and
    // View > Appearance > Light. Proves the menu -> IPC -> preload -> page
    // wiring (navigation and theme), not just that the window renders.
    actions.navigate('/settings');
    actions.setTheme('light');
    await new Promise((r) => setTimeout(r, 1500));
    // The native folder picker's "Browse..." button lives in each library's
    // settings, so open Movies' before looking for it.
    const afterMenu = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const path = location.pathname;
        const movies = [...document.querySelectorAll('.settings-nav-item')].find((b) => b.textContent.trim() === 'Movies');
        if (movies) movies.click();
        await new Promise((r) => setTimeout(r, 500));
        return JSON.stringify({
          path,
          theme: document.documentElement.dataset.theme,
          browseButton: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Browse...')
        });
      })()`)
    );
    const menuLabels = (Menu.getApplicationMenu()?.items || []).map((i) => i.label.replace('&', ''));

    // Everything the real UI does over app://: a JSON write and read-back,
    // a raw binary upload then fetching that image back, a streamed text
    // download, a streamed zip download, and the SPA fallback page.
    const bridge = JSON.parse(
      await win.webContents.executeJavaScript(`(async () => {
        const out = {};
        const json = { 'Content-Type': 'application/json' };
        let r = await fetch('/api/settings', { method: 'PUT', headers: json, body: JSON.stringify({ library_dirs: { movies: ['C:/smoke-test-folder'] } }) });
        out.jsonWrite = r.status;
        out.jsonReadBack = (await (await fetch('/api/settings')).json()).library_dirs.movies.dirs.join(',');
        await fetch('/api/settings', { method: 'PUT', headers: json, body: JSON.stringify({ library_dirs: { movies: null } }) });

        const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
        r = await fetch('/api/games/platforms/SmokePlatform/cover/upload', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
        const uploaded = await r.json();
        out.upload = r.status;
        const img = await fetch(uploaded.cover_url);
        out.imageStatus = img.status;
        out.imageType = img.headers.get('content-type');
        out.imageBytes = (await img.arrayBuffer()).byteLength;
        await fetch('/api/games/platforms/SmokePlatform/cover', { method: 'DELETE' });

        out.spaType = (await fetch('/tv')).headers.get('content-type');

        async function exportAndDownload(kind) {
          await fetch('/api/exports/' + kind, { method: 'POST' });
          let list = [];
          for (let i = 0; i < 40 && !list.length; i++) {
            await new Promise((res) => setTimeout(res, 250));
            list = await (await fetch('/api/exports/' + kind)).json();
          }
          if (!list.length) return { status: 0 };
          const name = list[0].filename || list[0].name;
          const d = await fetch('/api/exports/' + kind + '/' + encodeURIComponent(name) + '/download');
          const bytes = (await d.arrayBuffer()).byteLength;
          return { status: d.status, type: d.headers.get('content-type'), bytes, disposition: d.headers.get('content-disposition') };
        }
        out.textDownload = await exportAndDownload('text');
        out.zipDownload = await exportAndDownload('html');
        return JSON.stringify(out);
      })()`)
    );

    if (SCREENSHOT) {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(SCREENSHOT, image.toPNG());
    }
    Object.assign(result, {
      page,
      afterMenu,
      bridge,
      menuLabels,
      nativeThemeSource: nativeTheme.themeSource,
      listeningTcpPorts: listening,
      health,
      desktopFlag: settings.desktop,
      layout: { root: layout.root, portable: layout.portable },
      versions: { electron: process.versions.electron, node: process.versions.node },
    });
    result.ok = !!(
      page.hasDesktopBridge && page.rendered && health && health.ok && settings && settings.desktop === true &&
      Array.isArray(listening) && listening.length === 0 &&
      bridge.jsonWrite === 200 && bridge.jsonReadBack === 'C:/smoke-test-folder' &&
      bridge.upload === 200 && bridge.imageStatus === 200 && (bridge.imageType || '').startsWith('image/') && bridge.imageBytes > 0 &&
      /html/.test(bridge.spaType || '') &&
      bridge.textDownload.status === 200 && bridge.textDownload.bytes > 0 &&
      bridge.zipDownload.status === 200 && /zip/.test(bridge.zipDownload.type || '') && bridge.zipDownload.bytes > 0 &&
      afterMenu.path === '/settings' && afterMenu.theme === 'light' && afterMenu.browseButton &&
      nativeTheme.themeSource === 'light' && menuLabels.join(',') === 'File,Edit,View,Window,Help'
    );
  } catch (err) {
    result.error = String(err && err.stack ? err.stack : err);
  }
  if (SMOKE_OUT) fs.writeFileSync(SMOKE_OUT, JSON.stringify(result, null, 2));
  quitting = true;
  if (engineProc) engineProc.kill();
  app.exit(result.ok ? 0 : 1);
}

async function main() {
  await app.whenReady();
  createWindow();
  applyMenu();

  try {
    engineProc = await startEngine();
    protocol.handle(SCHEME, proxyToEngine);
  } catch (err) {
    if (SMOKE && SMOKE_OUT) fs.writeFileSync(SMOKE_OUT, JSON.stringify({ ok: false, error: err.message }));
    dialog.showErrorBox('Media Catalog could not start', `${err.message}\n\nLogs: ${LOG_DIR}`);
    app.exit(1);
    return;
  }

  // Match the native frame/menus to the saved theme before showing the UI.
  try {
    const settings = (await engineRequest('GET', '/api/settings')).json;
    if (settings && settings.ui_theme) setNativeTheme(settings.ui_theme);
  } catch {
    /* the page applies its own theme regardless */
  }

  if (SMOKE) win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().startsWith(`${ORIGIN}/`)) smokeCheck();
  });
  win.loadURL(`${ORIGIN}/`);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (engineProc) engineProc.kill();
});

app.on('window-all-closed', () => app.quit());

if (gotLock) {
  main().catch((err) => {
    dialog.showErrorBox('Media Catalog', String(err && err.stack ? err.stack : err));
    app.exit(1);
  });
}
