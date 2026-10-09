const db = require('../db');

// Where each media type's files live. Three layers, first match wins:
//   1. Settings — picked in the UI (a JSON array stored in `settings`)
//   2. the legacy environment variable (comma-separated) — what Docker /
//      compose deployments already set, so nothing about them changes
//   3. the container mount path the Docker image has always defaulted to
//      (/movies, /tv, ...) — but not in the desktop app, where there's no
//      container layout to default to: a type with nothing chosen yet just
//      has no folders until the user picks one.
//
// Read at scan time, not module load, so a folder changed in Settings takes
// effect on the very next scan without restarting anything.
const TYPES = {
  movies: { env: 'MOVIES_DIR', fallback: '/movies' },
  tv: { env: 'TV_DIR', fallback: '/tv' },
  audiobooks: { env: 'AUDIOBOOKS_DIR', fallback: '/audiobooks' },
  comics: { env: 'COMICS_DIR', fallback: '/comics' },
  ebooks: { env: 'EBOOKS_DIR', fallback: '/ebooks' },
  albums: { env: 'ALBUMS_DIR', fallback: '/albums' },
};

function isDesktop() {
  return !!process.env.MEDIA_CATALOG_DESKTOP;
}

function readSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function clean(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const p = String(item || '').trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function parseSaved(raw) {
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? clean(arr) : null;
  } catch {
    return null;
  }
}

// { dirs, source } — source is where the effective list came from, so the
// UI can say so (and offer to revert to the default when it was overridden).
function describeLibraryDirs(type) {
  const t = TYPES[type];
  if (!t) throw new Error(`Unknown library type: ${type}`);
  const saved = parseSaved(readSetting(`${type}_dirs`));
  if (saved !== null) return { dirs: saved, source: 'settings' };
  const env = clean((process.env[t.env] || '').split(','));
  if (env.length) return { dirs: env, source: 'env' };
  return { dirs: isDesktop() ? [] : [t.fallback], source: 'default' };
}

function getLibraryDirs(type) {
  return describeLibraryDirs(type).dirs;
}

function describeLaunchboxDir() {
  const saved = (readSetting('launchbox_dir') || '').trim();
  if (saved) return { dir: saved, source: 'settings' };
  const env = (process.env.LAUNCHBOX_DIR || '').trim();
  if (env) return { dir: env, source: 'env' };
  return { dir: '', source: 'default' };
}

function getLaunchboxDir() {
  return describeLaunchboxDir().dir;
}

function setLibraryDirs(type, dirs) {
  if (!TYPES[type]) throw new Error(`Unknown library type: ${type}`);
  if (dirs === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(`${type}_dirs`);
    return;
  }
  const value = JSON.stringify(clean(Array.isArray(dirs) ? dirs : []));
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(`${type}_dirs`, value);
}

function setLaunchboxDir(dir) {
  if (dir === null || String(dir).trim() === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run('launchbox_dir');
    return;
  }
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('launchbox_dir', String(dir).trim());
}

const NO_FOLDERS_MESSAGE = 'No folders configured — add one in this media type\'s Settings.';

module.exports = {
  TYPES,
  isDesktop,
  describeLibraryDirs,
  getLibraryDirs,
  describeLaunchboxDir,
  getLaunchboxDir,
  setLibraryDirs,
  setLaunchboxDir,
  NO_FOLDERS_MESSAGE,
};
