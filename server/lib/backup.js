const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'posters');

// Deliberately NOT inside DATA_DIR by default's own logic — well, it falls
// back to a subfolder of it for zero-config convenience, but the whole
// point of this feature is that DATA_DIR can itself vanish (a Docker
// Desktop/Portainer stack recreation can silently start a brand-new,
// empty bind-mount folder — see README's Backups section for why). Anyone
// relying on this for real protection should set BACKUP_DIR to a path
// that survives that independently of DATA_DIR, e.g. a different share
// entirely.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const DEFAULT_RETENTION = 14;

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM backup_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare('UPDATE backup_status SET running=@running, last_run=@last_run, started_at=@started_at, message=@message WHERE id = 1').run(merged);
}

// The database (library-<stamp>.db) is the irreplaceable part — personal
// ratings/notes/tags, and which catalog entry each library item is already
// matched to. Cached posters/covers (images-<stamp>/) are paired with it by
// sharing that same <stamp>: mostly re-fetchable from their source APIs on
// a metadata refresh, but a manually-uploaded custom cover isn't, so
// they're backed up too rather than treated as disposable.
//
// This is a plain recursive directory copy (fs.cpSync, built into Node —
// no third-party dependency), not a zip. An earlier version of this used a
// zip library and crashed the server on startup in production the moment
// that library shared a process with better-sqlite3 — a different native
// failure than the one that motivated it in the first place, on a
// different platform. A plain copy has no such interaction: it's the same
// fs calls already used everywhere else in this file.
function imagesDirNameFor(dbFilename) {
  return dbFilename.replace(/^library-/, 'images-').replace(/\.db$/, '');
}

function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      try { total += fs.statSync(full).size; } catch { /* deleted mid-walk, skip */ }
    }
  }
  return total;
}

function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  const imageDirNames = new Set(entries.filter((e) => e.isDirectory() && e.name.startsWith('images-')).map((e) => e.name));
  return entries
    .filter((e) => e.isFile() && e.name.startsWith('library-') && e.name.endsWith('.db'))
    .map((e) => {
      const f = e.name;
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const imagesDirName = imagesDirNameFor(f);
      const hasImages = imageDirNames.has(imagesDirName);
      return {
        filename: f,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
        images_dir: hasImages ? imagesDirName : null,
        images_size: hasImages ? dirSize(path.join(BACKUP_DIR, imagesDirName)) : null,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Resolves a client-supplied filename/dirname (list/delete/download all
// take a bare name back) to a path guaranteed to stay inside BACKUP_DIR —
// guards against path traversal (e.g. "../../../etc/passwd") from ever
// reaching fs.unlinkSync/fs.rmSync/res.download. Works the same whether
// the name is the library-*.db file or its paired images-* directory.
function safeBackupPath(filename) {
  const base = path.basename(String(filename || ''));
  // Resolve BACKUP_DIR to an absolute path before joining/comparing — if
  // it's relative (e.g. a relative DATA_DIR in local dev), comparing a
  // relative dirname against path.resolve()'s always-absolute result would
  // never match, rejecting every filename as "invalid" even with no
  // traversal involved.
  const resolvedBackupDir = path.resolve(BACKUP_DIR);
  const full = path.join(resolvedBackupDir, base);
  if (!base || path.dirname(full) !== resolvedBackupDir) {
    throw new Error('Invalid backup filename');
  }
  return full;
}

function pruneOldBackups() {
  const retention = Number(getSetting('backup_retention_count')) || DEFAULT_RETENTION;
  for (const b of listBackups().slice(retention)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.filename)); } catch { /* already gone, fine */ }
    if (b.images_dir) {
      try { fs.rmSync(path.join(BACKUP_DIR, b.images_dir), { recursive: true, force: true }); } catch { /* already gone, fine */ }
    }
  }
}

// Uses better-sqlite3's own online backup API (SQLite's native backup
// mechanism) rather than a plain file copy — critical in WAL mode, where
// copying library.db alone misses whatever's still sitting in
// library.db-wal. This is exactly the failure mode this whole feature
// exists to protect against: a snapshot taken this way is always a
// complete, consistent copy regardless of what's checkpointed yet.
//
// SQLite's backup API opens its *destination* as a real database too,
// subject to the same file-locking primitives as any other — and network
// filesystems (CIFS/SMB/NFS) are notoriously unreliable at supporting
// those, which is why SQLite's own docs warn against putting a database
// on one at all. If BACKUP_DIR is a network share (as it often will be,
// deliberately, per the README), backing up straight into it can fail
// silently or outright. So the SQLite-level step always happens on local,
// reliable storage first (a scratch file next to the live database),
// and only the finished, already-closed file gets copied onto BACKUP_DIR
// — an ordinary byte copy needs none of SQLite's locking, so a network
// share is fine for that part even though it isn't for the first part.
// The images copy is a plain recursive file copy the whole way through —
// no locking concerns to route around, so it goes straight to BACKUP_DIR.
async function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `library-${stamp}.db`;
  const dest = path.join(BACKUP_DIR, filename);

  const scratchDir = path.join(DATA_DIR, '.backup-scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  const scratchFile = path.join(scratchDir, filename);
  try {
    await db.backup(scratchFile);
    fs.copyFileSync(scratchFile, dest);
  } finally {
    try { fs.unlinkSync(scratchFile); } catch { /* best-effort cleanup */ }
  }

  const imagesDirName = imagesDirNameFor(filename);
  const imagesDest = path.join(BACKUP_DIR, imagesDirName);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.cpSync(IMAGES_DIR, imagesDest, { recursive: true });

  pruneOldBackups();
  const stat = fs.statSync(dest);
  return {
    filename,
    size: stat.size,
    created_at: stat.mtime.toISOString(),
    images_dir: imagesDirName,
    images_size: dirSize(imagesDest),
  };
}

// Named runBackup (not runScheduledBackup) to match the runScan/runSync
// convention every other media type's scheduler job already uses —
// autoScanScheduler.js calls this on its own interval-gated schedule, and
// the manual "Back Up Now" button in Settings calls the exact same
// function directly, bypassing only the interval check (never the
// running-guard), same relationship as every "Scan Now" button.
async function runBackup() {
  const status = db.prepare('SELECT running FROM backup_status WHERE id = 1').get();
  if (status.running) return;
  const startedAt = new Date();
  // started_at is stored (not just timed in-memory) so the client can show
  // a live elapsed-time counter purely by polling status — it doesn't need
  // its own clock kept in sync with when the backup actually began, which
  // matters for a scheduled/automatic backup the user didn't just click a
  // button to start.
  setStatus({ running: 1, started_at: startedAt.toISOString(), message: 'Backing up...' });
  try {
    const result = await createBackup();
    const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    setStatus({
      running: 0,
      last_run: new Date().toISOString(),
      message: `Backup complete — ${result.filename} (${(result.size / 1024).toFixed(0)} KB) + images (${(result.images_size / 1024).toFixed(0)} KB) in ${seconds}s.`,
    });
  } catch (err) {
    setStatus({ running: 0, message: `Backup failed: ${err.message}` });
  }
}

function deleteBackup(filename) {
  fs.unlinkSync(safeBackupPath(filename));
  // Best-effort: older backups made before images were included have no
  // paired directory to delete, which is fine.
  try { fs.rmSync(safeBackupPath(imagesDirNameFor(filename)), { recursive: true, force: true }); } catch { /* no paired images dir */ }
}

// Restoring means replacing the file this process's live `db` connection
// already has open — better-sqlite3 doesn't expect its underlying file to
// be swapped out for a different database while a connection is open, so
// this closes that connection first. Every other module holds its own
// `require('../db')` reference to the now-closed instance, and there's no
// cheap way to hot-swap that everywhere it's cached — so rather than try,
// this closes the process down (see routes/backups.js) and relies on the
// platform's restart policy (docker-compose's `restart: unless-stopped`)
// to bring it back up fresh against the restored file. That means this is
// a genuinely rare, deliberate action, not a background one.
async function restoreBackup(filename) {
  const src = safeBackupPath(filename);
  if (!fs.existsSync(src)) throw new Error('Backup not found');

  // Safety net: snapshot whatever's live right now, before it's
  // overwritten — restoring the wrong file by mistake is itself
  // recoverable this way. Best-effort: a failure here (e.g. disk full)
  // shouldn't block a restore the user deliberately asked for.
  try { await createBackup(); } catch { /* see above */ }

  const dbPath = path.join(DATA_DIR, 'library.db');
  const tmpPath = `${dbPath}.restoring`;
  // Copy to a temp file BEFORE touching the live db or closing the
  // connection — if this fails (disk full, permissions), the running app
  // hasn't been disturbed at all, and the error above is still reportable.
  fs.copyFileSync(src, tmpPath);

  // Images are additive (every cached file is named deterministically from
  // its source, whether that's a TMDB path or a hash of a custom upload),
  // so copying on top of what's already there is safe — no need to wipe
  // IMAGES_DIR first. A backup made before this feature existed has no
  // paired images directory; that's fine, restoring the database alone
  // still works, just without bringing any old posters back with it.
  const imagesSrc = safeBackupPath(imagesDirNameFor(filename));
  if (fs.existsSync(imagesSrc)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.cpSync(imagesSrc, IMAGES_DIR, { recursive: true, force: true });
  }

  db.close();
  // Drop the current WAL/SHM sidecar files, if any — otherwise SQLite
  // would try to replay leftover WAL frames from the PREVIOUS database
  // against the newly-restored one on next open.
  for (const suffix of ['-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* fine if missing */ }
  }
  fs.renameSync(tmpPath, dbPath); // atomic on the same filesystem
}

module.exports = { createBackup, runBackup, listBackups, deleteBackup, restoreBackup, safeBackupPath, imagesDirNameFor, BACKUP_DIR };
