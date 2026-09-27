const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
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
  db.prepare('UPDATE backup_status SET running=@running, last_run=@last_run, message=@message WHERE id = 1').run(merged);
}

// The database (library-<stamp>.db) is the irreplaceable part — personal
// ratings/notes/tags, and which catalog entry each library item is already
// matched to. Cached posters/covers (images-<stamp>.zip) are paired with it
// by sharing that same <stamp>: mostly re-fetchable from their source APIs
// on a metadata refresh, but a manually-uploaded custom cover isn't, so
// they're backed up too rather than treated as disposable.
function imagesFilenameFor(dbFilename) {
  return dbFilename.replace(/^library-/, 'images-').replace(/\.db$/, '.zip');
}

function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUP_DIR);
  const imageFiles = new Set(files.filter((f) => f.startsWith('images-') && f.endsWith('.zip')));
  return files
    .filter((f) => f.startsWith('library-') && f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const imagesFilename = imagesFilenameFor(f);
      const hasImages = imageFiles.has(imagesFilename);
      const imagesStat = hasImages ? fs.statSync(path.join(BACKUP_DIR, imagesFilename)) : null;
      return {
        filename: f,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
        images_filename: hasImages ? imagesFilename : null,
        images_size: imagesStat ? imagesStat.size : null,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Resolves a client-supplied filename (list/delete/download all take a
// bare filename back) to a path guaranteed to stay inside BACKUP_DIR —
// guards against path traversal (e.g. "../../../etc/passwd") from ever
// reaching fs.unlinkSync/res.download. Accepts either half of a pair
// (library-*.db or images-*.zip), since download/delete act on each file
// individually.
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
    if (b.images_filename) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.images_filename)); } catch { /* already gone, fine */ }
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
async function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `library-${stamp}.db`;
  const imagesFilename = imagesFilenameFor(filename);
  const dest = path.join(BACKUP_DIR, filename);
  const imagesDest = path.join(BACKUP_DIR, imagesFilename);

  const scratchDir = path.join(DATA_DIR, '.backup-scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  const scratchFile = path.join(scratchDir, filename);
  const imagesScratchFile = path.join(scratchDir, imagesFilename);
  try {
    await db.backup(scratchFile);
    fs.copyFileSync(scratchFile, dest);

    // Same local-scratch-then-copy pattern as the database above, and for
    // the same reason: BACKUP_DIR may be a network share, and building the
    // zip there directly risks a slow or partial write over CIFS/SMB.
    // Building it locally first means the only thing that ever touches the
    // network share is a single finished-file copy.
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const zip = new AdmZip();
    zip.addLocalFolder(IMAGES_DIR);
    zip.writeZip(imagesScratchFile);
    fs.copyFileSync(imagesScratchFile, imagesDest);
  } finally {
    try { fs.unlinkSync(scratchFile); } catch { /* best-effort cleanup */ }
    try { fs.unlinkSync(imagesScratchFile); } catch { /* best-effort cleanup */ }
  }

  pruneOldBackups();
  const stat = fs.statSync(dest);
  const imagesStat = fs.statSync(imagesDest);
  return {
    filename,
    size: stat.size,
    created_at: stat.mtime.toISOString(),
    images_filename: imagesFilename,
    images_size: imagesStat.size,
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
  setStatus({ running: 1, message: 'Backing up...' });
  try {
    const result = await createBackup();
    setStatus({
      running: 0,
      last_run: new Date().toISOString(),
      message: `Backup complete — ${result.filename} (${(result.size / 1024).toFixed(0)} KB) + images (${(result.images_size / 1024).toFixed(0)} KB).`,
    });
  } catch (err) {
    setStatus({ running: 0, message: `Backup failed: ${err.message}` });
  }
}

function deleteBackup(filename) {
  fs.unlinkSync(safeBackupPath(filename));
  // Best-effort: older backups made before images were included have no
  // paired zip to delete, which is fine.
  try { fs.unlinkSync(safeBackupPath(imagesFilenameFor(filename))); } catch { /* no paired images file */ }
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
  // so extracting on top of what's already there is safe — no need to wipe
  // IMAGES_DIR first. A backup made before this feature existed has no
  // paired zip; that's fine, restoring the database alone still works, just
  // without bringing any old posters back with it.
  const imagesSrc = safeBackupPath(imagesFilenameFor(filename));
  if (fs.existsSync(imagesSrc)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    new AdmZip(imagesSrc).extractAllTo(IMAGES_DIR, true);
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

module.exports = { createBackup, runBackup, listBackups, deleteBackup, restoreBackup, safeBackupPath, imagesFilenameFor, BACKUP_DIR };
