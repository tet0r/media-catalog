const fs = require('fs');
const path = require('path');
const db = require('../db');
const { BACKUP_DIR } = require('./backup');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const POSTERS_DIR = path.join(DATA_DIR, 'posters');

// Image backups: a plain folder copy of the cached cover/poster images,
// kept apart from the database backups (which hold only the database) and
// on their own schedule. One folder that's kept up to date rather than a
// new full copy per run — images are large, rarely change, and are named by
// content/URL, so after the first run each backup only copies what's new.
//
// This is deliberately ADD/UPDATE ONLY — it never deletes anything from the
// backup. A mirror that removed files the source no longer has would, the
// moment the data folder was ever wiped (the very thing a backup is for),
// faithfully wipe the backup on its next automatic run. The cost is that an
// image the app later replaces or deletes stays in the backup; that's a
// price worth paying for a backup that can't erase itself.
const IMAGE_BACKUP_DIR = path.join(BACKUP_DIR, 'images');

const MB = 1024 * 1024;

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM image_backup_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(
    'UPDATE image_backup_status SET running=@running, last_run=@last_run, started_at=@started_at, message=@message WHERE id = 1'
  ).run(merged);
}

const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));

// A file is already backed up when the copy has the same size and the same
// modification time (copies keep the source's time, below). A little
// tolerance, since some network shares store timestamps coarsely.
function upToDate(srcStat, destPath) {
  try {
    const d = fs.statSync(destPath);
    return d.size === srcStat.size && Math.abs(d.mtimeMs - srcStat.mtimeMs) < 2000;
  } catch {
    return false;
  }
}

// Written under a temp name first, then renamed, so an interrupted copy
// (a network share dropping mid-file) can never leave a truncated image
// sitting under the real name — which a later run would mistake for done.
// The source's modification time is carried over so "has it changed?" is a
// cheap comparison next time.
function copyFile(srcPath, destPath, srcStat) {
  const tmp = `${destPath}.part`;
  fs.copyFileSync(srcPath, tmp);
  fs.utimesSync(tmp, srcStat.atime, srcStat.mtime);
  try {
    fs.renameSync(tmp, destPath);
  } catch {
    fs.copyFileSync(tmp, destPath);
    fs.utimesSync(destPath, srcStat.atime, srcStat.mtime);
    fs.unlinkSync(tmp);
  }
}

// Every image under a folder — images sit in per-type subfolders
// (Movies/Posters, ...) — as paths relative to it with forward slashes.
function listFiles(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, ...(prefix ? prefix.split('/') : [])), { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...listFiles(dir, rel));
    else if (e.isFile() && !e.name.endsWith('.part') && !e.name.includes('.tmp-')) files.push(rel);
  }
  return files;
}

// Shared by backup and restore: copy what's missing from `to`, and — for
// backup only — what has changed. Restore never overwrites a file that's
// already there.
async function syncFolder(from, to, { overwriteChanged, verb }) {
  fs.mkdirSync(to, { recursive: true });
  const names = listFiles(from);
  const totals = { copied: 0, skipped: 0, failed: 0, bytes: 0, total: names.length };

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const src = path.join(from, ...name.split('/'));
    const dest = path.join(to, ...name.split('/'));
    try {
      const stat = fs.statSync(src);
      const present = fs.existsSync(dest);
      if (present && (!overwriteChanged || upToDate(stat, dest))) {
        totals.skipped++;
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        copyFile(src, dest, stat);
        totals.copied++;
        totals.bytes += stat.size;
      }
    } catch {
      totals.failed++;
    }
    if (i % 50 === 49) {
      setStatus({ message: `${verb} images — ${i + 1} of ${names.length}...` });
      // Don't hog the server for a big first run.
      await yieldEventLoop();
    }
  }
  return totals;
}

function summarize(label, t, seconds) {
  if (t.total === 0) return `${label} — there are no images to copy.`;
  const parts = [`${t.copied} copied (${(t.bytes / MB).toFixed(1)} MB)`, `${t.skipped} already up to date`];
  if (t.failed) parts.push(`${t.failed} failed`);
  return `${label} — ${parts.join(', ')} in ${seconds}s.`;
}

async function runJob(label, verb, work) {
  const status = db.prepare('SELECT running FROM image_backup_status WHERE id = 1').get();
  if (status.running) return;
  const startedAt = new Date();
  setStatus({ running: 1, started_at: startedAt.toISOString(), message: `${verb} images...` });
  try {
    const totals = await work();
    const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    setStatus({ running: 0, last_run: new Date().toISOString(), message: summarize(label, totals, seconds) });
  } catch (err) {
    setStatus({ running: 0, message: `${label} failed: ${err.message}` });
  }
}

// Named runScan-style so autoScanScheduler.js can call it directly on its
// schedule; the "Back Up Images Now" button calls the same function.
function runImageBackup() {
  return runJob('Image backup complete', 'Backing up', () =>
    syncFolder(POSTERS_DIR, IMAGE_BACKUP_DIR, { overwriteChanged: true, verb: 'Backing up' })
  );
}

// Puts back any image that's missing from the app's own folder (for example
// after the data folder was wiped). Never overwrites an image that's there.
function runImageRestore() {
  return runJob('Image restore complete', 'Restoring', () =>
    syncFolder(IMAGE_BACKUP_DIR, POSTERS_DIR, { overwriteChanged: false, verb: 'Restoring' })
  );
}

// What's in the backup folder right now. Walks the folder, so callers ask
// for it occasionally (page load, after a run) rather than on every poll.
function getImageBackupInfo() {
  const names = listFiles(IMAGE_BACKUP_DIR);
  let bytes = 0;
  for (const name of names) {
    try {
      bytes += fs.statSync(path.join(IMAGE_BACKUP_DIR, ...name.split('/'))).size;
    } catch {
      /* vanished mid-walk — fine */
    }
  }
  return { dir: IMAGE_BACKUP_DIR, file_count: names.length, total_bytes: bytes };
}

module.exports = { runImageBackup, runImageRestore, getImageBackupInfo, IMAGE_BACKUP_DIR };
