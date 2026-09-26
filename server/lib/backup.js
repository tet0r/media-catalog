const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

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
  db.prepare('UPDATE backup_status SET running=@running, last_run=@last_run, message=@message WHERE id = 1').run(merged);
}

// Only the database — not cached posters/covers. The database is the
// irreplaceable part (personal ratings/notes/tags, and which catalog entry
// each library item is already matched to), while posters are cheap to
// re-fetch from their source APIs on a metadata refresh (aside from a
// manually-uploaded custom cover, a smaller edge case). Backing up
// thousands of poster files too would make this much slower and heavier
// for comparatively little protection.
function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('library-') && f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Resolves a client-supplied filename (list/delete/download all take a
// bare filename back) to a path guaranteed to stay inside BACKUP_DIR —
// guards against path traversal (e.g. "../../../etc/passwd") from ever
// reaching fs.unlinkSync/res.download.
function safeBackupPath(filename) {
  const base = path.basename(String(filename || ''));
  const full = path.join(BACKUP_DIR, base);
  if (!base || path.dirname(full) !== path.resolve(BACKUP_DIR)) {
    throw new Error('Invalid backup filename');
  }
  return full;
}

function pruneOldBackups() {
  const retention = Number(getSetting('backup_retention_count')) || DEFAULT_RETENTION;
  for (const b of listBackups().slice(retention)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.filename)); } catch { /* already gone, fine */ }
  }
}

// Uses better-sqlite3's own online backup API (SQLite's native backup
// mechanism) rather than a plain file copy — critical in WAL mode, where
// copying library.db alone misses whatever's still sitting in
// library.db-wal. This is exactly the failure mode this whole feature
// exists to protect against: a snapshot taken this way is always a
// complete, consistent copy regardless of what's checkpointed yet.
async function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `library-${stamp}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  await db.backup(dest);
  pruneOldBackups();
  const stat = fs.statSync(dest);
  return { filename, size: stat.size, created_at: stat.mtime.toISOString() };
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
  setStatus({ running: 1, message: 'Backing up...' });
  try {
    const result = await createBackup();
    setStatus({
      running: 0,
      last_run: new Date().toISOString(),
      message: `Backup complete — ${result.filename} (${(result.size / 1024).toFixed(0)} KB).`,
    });
  } catch (err) {
    setStatus({ running: 0, message: `Backup failed: ${err.message}` });
  }
}

function deleteBackup(filename) {
  fs.unlinkSync(safeBackupPath(filename));
}

module.exports = { createBackup, runBackup, listBackups, deleteBackup, safeBackupPath, BACKUP_DIR };
