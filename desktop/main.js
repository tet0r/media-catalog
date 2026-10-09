const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme, Notification } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { buildMenu } = require('./menu');

const REPO_URL = 'https://github.com/tet0r/media-catalog';
// A fixed port, when it's free, keeps the window's origin identical from
// launch to launch — the origin is what scopes localStorage, so a random
// port every time would quietly forget things like the chosen theme.
const PREFERRED_PORT = 38417;

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
let baseUrl = null;
let serverProc = null;
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

// ---- the bundled server -----------------------------------------------
function findPort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const any = net.createServer();
      any.listen(0, '127.0.0.1', () => {
        const { port } = any.address();
        any.close(() => resolve(port));
      });
    });
    probe.listen(preferred, '127.0.0.1', () => probe.close(() => resolve(preferred)));
  });
}

function spawnServer(port) {
  return new Promise((resolve, reject) => {
    const entry = path.join(SERVER_DIR, 'index.js');
    if (!fs.existsSync(entry)) {
      reject(new Error(`Bundled server not found at ${entry}. Run "npm run prepare-app" in desktop/ first.`));
      return;
    }
    // Run the same Express server the Docker image runs, in its own process
    // (Electron's own binary acting as plain Node) so a long scan or sync
    // never freezes the window or its menus.
    const child = fork(entry, [], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        MEDIA_CATALOG_DESKTOP: '1',
        NODE_ENV: 'production',
        PORT: String(port),
        DATA_DIR,
        BACKUP_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const log = fs.createWriteStream(path.join(LOG_DIR, 'server.log'), { flags: 'a' });
    log.write(`\n--- ${new Date().toISOString()} starting server (port ${port}) ---\n`);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Server did not start within 30 seconds'));
    }, 30000);
    child.once('message', (m) => {
      if (m && m.type === 'ready') {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Server exited during startup (code ${code}, signal ${signal})`));
    });
  });
}

async function startServer(port) {
  // A few attempts: the native SQLite module has been seen to fail to load
  // sporadically on some Windows setups, and a retry is all it takes.
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const child = await spawnServer(port);
      child.removeAllListeners('exit');
      child.on('exit', onServerExit);
      return child;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function onServerExit(code) {
  if (quitting) return;
  const now = Date.now();
  restartTimes = restartTimes.filter((t) => now - t < 60000);
  restartTimes.push(now);
  if (restartTimes.length > 3) {
    dialog.showErrorBox('Media Catalog', `The background service keeps stopping (exit code ${code}).\n\nLogs: ${LOG_DIR}`);
    quitting = true;
    app.quit();
    return;
  }
  try {
    serverProc = await startServer(Number(new URL(baseUrl).port));
  } catch (err) {
    dialog.showErrorBox('Media Catalog', `The background service stopped and could not be restarted.\n\n${err.message}\n\nLogs: ${LOG_DIR}`);
    quitting = true;
    app.quit();
  }
}

// ---- talking to the server from menu actions -------------------------
async function apiPost(route) {
  try {
    const res = await fetch(`${baseUrl}${route}`, { method: 'POST' });
    return res.status; // 202 started, 409 already running
  } catch {
    return 0;
  }
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

  // The app is only ever its own localhost pages — anything else (TMDB
  // links, the GitHub changelog, ...) opens in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (baseUrl && url.startsWith(baseUrl)) return;
    if (url.startsWith('data:')) return;
    event.preventDefault();
    if (isWebUrl(url)) shell.openExternal(url);
  });

  win.on('close', saveWindowState);
  win.on('closed', () => {
    win = null;
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
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    const settings = await (await fetch(`${baseUrl}/api/settings`)).json();

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

    if (SCREENSHOT) {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(SCREENSHOT, image.toPNG());
    }
    Object.assign(result, {
      page,
      afterMenu,
      menuLabels,
      nativeThemeSource: nativeTheme.themeSource,
      health,
      desktopFlag: settings.desktop,
      layout: { root: layout.root, portable: layout.portable },
      versions: { electron: process.versions.electron, node: process.versions.node },
    });
    result.ok = !!(
      page.hasDesktopBridge && page.rendered && health.ok && settings.desktop === true &&
      afterMenu.path === '/settings' && afterMenu.theme === 'light' && afterMenu.browseButton &&
      nativeTheme.themeSource === 'light' && menuLabels.join(',') === 'File,Edit,View,Window,Help'
    );
  } catch (err) {
    result.error = String(err && err.stack ? err.stack : err);
  }
  if (SMOKE_OUT) fs.writeFileSync(SMOKE_OUT, JSON.stringify(result, null, 2));
  quitting = true;
  if (serverProc) serverProc.kill();
  app.exit(result.ok ? 0 : 1);
}

async function main() {
  await app.whenReady();
  createWindow();
  applyMenu();

  try {
    const port = await findPort(PREFERRED_PORT);
    serverProc = await startServer(port);
    baseUrl = `http://127.0.0.1:${port}`;
  } catch (err) {
    if (SMOKE && SMOKE_OUT) fs.writeFileSync(SMOKE_OUT, JSON.stringify({ ok: false, error: err.message }));
    dialog.showErrorBox('Media Catalog could not start', `${err.message}\n\nLogs: ${LOG_DIR}`);
    app.exit(1);
    return;
  }

  // Match the native frame/menus to the saved theme before showing the UI.
  try {
    const settings = await (await fetch(`${baseUrl}/api/settings`)).json();
    if (settings.ui_theme) setNativeTheme(settings.ui_theme);
  } catch {
    /* the page applies its own theme regardless */
  }

  if (SMOKE) win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().startsWith(baseUrl)) smokeCheck();
  });
  win.loadURL(baseUrl);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (serverProc) serverProc.kill();
});

app.on('window-all-closed', () => app.quit());

if (gotLock) {
  main().catch((err) => {
    dialog.showErrorBox('Media Catalog', String(err && err.stack ? err.stack : err));
    app.exit(1);
  });
}
