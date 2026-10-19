const fs = require('fs');
const path = require('path');
const db = require('../db');

// Cached images used to be named by hash (custom-9f2c….jpg) or by TMDB's own
// random file names, so a posters folder — or an image backup of it — said
// nothing about what each picture is. This gives every image a name built
// from the item it belongs to and what kind of image it is:
//
//   the-matrix-1999-poster.jpg        the-matrix-1999-backdrop.jpg
//   project-hail-mary-2021-cover.jpg  pink-floyd-the-wall-cover.jpg
//   star-wars-collection-poster.jpg   brandon-sanderson-audiobook-author-cover.jpg
//
// It's done as a separate pass over the database rather than inside the ~80
// places that fetch, upload, or copy an image: every one of those still
// stores whatever name it likes, and this pass then renames the file to its
// proper name and updates the row — so a new item, an edited title, a freshly
// chosen or uploaded picture, and every image that predates this feature all
// end up named the same way. It runs at startup (the one-time migration), a
// moment after any change made through the API, and every half minute to catch
// background scans and syncs.
//
// A custom image (one picked or uploaded by the user) always wins: it takes
// the item's proper name and overwrites whatever file was there before.
//
// The same pass-and-sweep approach also cleans up after itself: any image file
// that no item uses any more — the old hash-named files once they've been
// renamed, a picture that was replaced, one whose item was deleted — is
// removed (see removeUnusedImages).

const POSTERS_DIR = () => path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'posters');

const MAX_SLUG_LENGTH = 80;
const PASS_INTERVAL_MS = 30 * 1000;
const SOON_DELAY_MS = 2 * 1000;
// A file this pass renames away from stays on disk for a while: the page that
// just showed it (or a response that's still in flight) may be about to
// request it by its old name.
const OLD_FILE_GRACE_MS = 2 * 60 * 1000;
// How many renames in one pass counts as "the migration" worth taking a
// database backup before — see runPass.
const BACKUP_THRESHOLD = 25;
// Unused-image cleanup. A file only counts as unused if it's been sitting
// there a while: a scan caches an image a moment before it records it in the
// database, and that file must never be caught in between.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const UNUSED_MIN_AGE_MS = 10 * 60 * 1000;
// The image backup is held to a stricter standard (see removeUnusedImages).
const BACKUP_UNUSED_MIN_AGE_MS = 60 * 60 * 1000;
// What the old naming scheme produced: custom-<sha1>.ext for anything
// picked/uploaded/copied, or TMDB's own 27-character names. Every new name
// has hyphens and ends in -poster/-backdrop/-cover, so neither can match.
const OLD_STYLE_NAME = /^(custom-[0-9a-f]{40}|[A-Za-z0-9]{20,})\.[A-Za-z0-9]+$/;

// table, column, what the image is, the name parts for the item's slug, and
// the word used in the slug if all the parts are empty.
const TARGETS = [
  { table: 'movies', column: 'poster_file', category: 'poster', fallback: 'movie', parts: (r) => [r.title, r.year] },
  { table: 'movies', column: 'backdrop_file', category: 'backdrop', fallback: 'movie', parts: (r) => [r.title, r.year] },
  { table: 'tv_shows', column: 'poster_file', category: 'poster', fallback: 'tv-show', parts: (r) => [r.title, r.year] },
  { table: 'tv_shows', column: 'backdrop_file', category: 'backdrop', fallback: 'tv-show', parts: (r) => [r.title, r.year] },
  { table: 'audiobooks', column: 'cover_file', category: 'cover', fallback: 'audiobook', parts: (r) => [r.title, r.year] },
  { table: 'ebooks', column: 'cover_file', category: 'cover', fallback: 'ebook', parts: (r) => [r.title, r.year] },
  { table: 'comics', column: 'cover_file', category: 'cover', fallback: 'comic', parts: (r) => [r.series || r.title, r.issue_number, r.year] },
  { table: 'albums', column: 'cover_file', category: 'cover', fallback: 'album', parts: (r) => [r.artist, r.title] },
  { table: 'vinyl_records', column: 'cover_file', category: 'cover', fallback: 'vinyl', parts: (r) => [r.artist, r.title, r.year] },
  { table: 'games', column: 'cover_file', category: 'cover', fallback: 'game', parts: (r) => [r.title, r.platform] },
  { table: 'collections', column: 'poster_file', category: 'poster', fallback: 'collection', parts: (r) => [r.name], collection: true },
  {
    table: 'group_images', column: 'cover_file', fallback: 'group', parts: (r) => [r.group_key],
    category: (r) => `${String(r.media_type || 'group').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-cover`,
  },
];

function slugify(parts, fallback) {
  const text = parts.filter((p) => p !== null && p !== undefined && String(p).trim() !== '').join(' ');
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || fallback;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function describe(target, row) {
  const slug = slugify(target.parts(row), target.fallback);
  let category = typeof target.category === 'function' ? target.category(row) : target.category;
  // "star-wars-collection" + "collection-poster" would read twice.
  if (target.collection) category = slug.endsWith('-collection') || slug === 'collection' ? 'poster' : 'collection-poster';
  return { slug, category };
}

function readRows(target) {
  return db.prepare(`SELECT rowid AS _rid, * FROM ${target.table} WHERE ${target.column} IS NOT NULL AND ${target.column} != ''`).all();
}

// Works out what each image should be renamed to, without touching anything.
// Returns [{ target, rid, from, to }].
function planRenames() {
  const postersDir = POSTERS_DIR();
  if (!fs.existsSync(postersDir)) return [];

  // How many rows point at each file — a file shared by several items (images
  // used to be shared when two items fetched the same picture) is copied, not
  // moved, and a name is only "taken" if some row points at it.
  const refs = new Map();
  const allRows = TARGETS.map((target) => ({ target, rows: readRows(target) }));
  for (const { target, rows } of allRows) {
    for (const row of rows) refs.set(row[target.column], (refs.get(row[target.column]) || 0) + 1);
  }

  const ops = [];
  for (const { target, rows } of allRows) {
    for (const row of rows) {
      const from = row[target.column];
      if (from.includes('/') || from.includes('\\')) continue;
      const { slug, category } = describe(target, row);
      const ext = path.extname(from).toLowerCase() || '.jpg';
      const alreadyNamed = new RegExp(`^${escapeRegExp(slug)}(-\\d+)?-${escapeRegExp(category)}(-\\d+)?${escapeRegExp(ext)}$`);
      if (alreadyNamed.test(from)) continue;
      // Nothing on disk to rename (e.g. images lost to a wiped data folder) —
      // leave the row alone; Refetch All Images / a restore can fill it in.
      if (!fs.existsSync(path.join(postersDir, from))) continue;

      const candidates = [`${slug}-${category}${ext}`, `${slug}-${row._rid}-${category}${ext}`];
      for (let n = 2; n < 50; n++) candidates.push(`${slug}-${row._rid}-${category}-${n}${ext}`);
      const to = candidates.find((name) => !refs.get(name));
      if (!to) continue;

      const shared = (refs.get(from) || 0) > 1;
      refs.set(from, (refs.get(from) || 1) - 1);
      refs.set(to, 1);
      ops.push({ target, rid: row._rid, from, to, shared });
    }
  }
  return ops;
}

// Old names awaiting deletion once nothing points at them (see
// OLD_FILE_GRACE_MS).
const pendingDeletes = new Set();
let sweepTimer = null;

function isReferenced(file) {
  return TARGETS.some((t) => db.prepare(`SELECT 1 FROM ${t.table} WHERE ${t.column} = ? LIMIT 1`).get(file));
}

function sweepPendingDeletes() {
  sweepTimer = null;
  for (const file of pendingDeletes) {
    pendingDeletes.delete(file);
    try {
      if (!isReferenced(file)) fs.unlinkSync(path.join(POSTERS_DIR(), file));
    } catch {
      /* already gone — fine */
    }
  }
}

function scheduleDelete(file) {
  pendingDeletes.add(file);
  if (!sweepTimer) {
    sweepTimer = setTimeout(sweepPendingDeletes, OLD_FILE_GRACE_MS);
    sweepTimer.unref();
  }
}

// A file that nothing else uses and that has sat on disk for a while is
// simply moved. A shared one is copied (the other items keep it), and a very
// recent one is copied too, with the old name deleted later (see
// OLD_FILE_GRACE_MS). Either way, a file already at the new name that nothing
// references is a leftover — a custom image replacing the item's old picture
// lands exactly here — and is overwritten.
function moveOrCopy(postersDir, op) {
  const src = path.join(postersDir, op.from);
  const dest = path.join(postersDir, op.to);
  const old = Date.now() - fs.statSync(src).mtimeMs > OLD_FILE_GRACE_MS;
  if (op.shared || !old) {
    fs.copyFileSync(src, dest);
    return { keepOld: true };
  }
  try {
    fs.renameSync(src, dest);
  } catch {
    // Windows refuses to rename over an existing file in some setups.
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
  return { keepOld: false };
}

async function applyRenames(ops) {
  const postersDir = POSTERS_DIR();
  let renamed = 0;
  for (const op of ops) {
    const { target, rid, from, to } = op;
    try {
      const { keepOld } = moveOrCopy(postersDir, op);
      const info = db.prepare(`UPDATE ${target.table} SET ${target.column} = ? WHERE rowid = ? AND ${target.column} = ?`).run(to, rid, from);
      if (info.changes === 0) {
        // The row changed while this pass was running — put things back.
        if (keepOld) {
          if (!isReferenced(to)) fs.unlinkSync(path.join(postersDir, to));
        } else if (!fs.existsSync(path.join(postersDir, from))) {
          fs.renameSync(path.join(postersDir, to), path.join(postersDir, from));
        }
        continue;
      }
      if (keepOld) scheduleDelete(from);
      renamed++;
    } catch {
      /* leave this one for the next pass */
    }
    // A migration can be thousands of files — let requests through.
    if (renamed % 50 === 49) await new Promise((resolve) => setImmediate(resolve));
  }
  return renamed;
}

// Every file name some item currently uses.
function referencedFiles() {
  const files = new Set();
  for (const t of TARGETS) {
    for (const row of db.prepare(`SELECT DISTINCT ${t.column} AS f FROM ${t.table} WHERE ${t.column} IS NOT NULL AND ${t.column} != ''`).all()) {
      files.add(row.f);
    }
  }
  return files;
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

function removeIfOlderThan(dir, name, minAgeMs) {
  try {
    const full = path.join(dir, name);
    if (Date.now() - fs.statSync(full).mtimeMs < minAgeMs) return false;
    fs.unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

// Deletes image files nothing uses.
//
// In the posters folder: every file no item points at, once it's old enough
// (UNUSED_MIN_AGE_MS) — the old hash-named originals left behind by the
// renaming, replaced pictures, deleted items' pictures.
//
// In the image backup folder: ONLY unused files with an old-style name (the
// leftovers of the renaming), and only after a longer wait. The backup is
// otherwise add-only on purpose — it exists to survive the data folder being
// wiped — so it never loses an image that merely isn't referenced right now.
//
// Both are skipped outright when no item uses any image at all: an empty
// database next to a full folder looks like a database that was lost or
// swapped, not a library with nothing in it, and "nothing is in use" must
// never be allowed to mean "delete everything".
function removeUnusedImages() {
  const referenced = referencedFiles();
  const result = { posters: 0, backup: 0 };
  if (referenced.size === 0) return result;

  const postersDir = POSTERS_DIR();
  for (const name of listFiles(postersDir)) {
    // Half-written temp files, and old names still inside their grace period.
    if (referenced.has(name) || pendingDeletes.has(name) || name.includes('.tmp-') || name.endsWith('.part')) continue;
    if (removeIfOlderThan(postersDir, name, UNUSED_MIN_AGE_MS)) result.posters++;
  }

  const backupDir = require('./imageBackup').IMAGE_BACKUP_DIR;
  for (const name of listFiles(backupDir)) {
    if (referenced.has(name) || !OLD_STYLE_NAME.test(name)) continue;
    if (removeIfOlderThan(backupDir, name, BACKUP_UNUSED_MIN_AGE_MS)) result.backup++;
  }
  return result;
}

function runCleanup() {
  try {
    const removed = removeUnusedImages();
    if (removed.posters || removed.backup) {
      console.log(`Removed unused images: ${removed.posters} from the library, ${removed.backup} old-named copies from the image backup.`);
    }
  } catch (err) {
    console.error('Removing unused images failed:', err.message);
  }
}

let running = false;

async function runPass() {
  if (running) return 0;
  running = true;
  try {
    const ops = planRenames();
    if (!ops.length) return 0;
    // The first big batch is the one-time migration of an existing library.
    // It only renames files and rewrites file names in the database, but
    // that's still a bulk change to the database, so take a backup first —
    // once.
    if (ops.length >= BACKUP_THRESHOLD) {
      const flag = db.prepare("SELECT value FROM settings WHERE key = 'image_rename_backup_done'").get();
      if (!flag) {
        try {
          await require('./backup').createBackup();
        } catch {
          /* a failed safety copy shouldn't stop the rename; it's reversible by Refetch/restore */
        }
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('image_rename_backup_done', '1')").run();
      }
    }
    return await applyRenames(planRenames());
  } catch (err) {
    console.error('Image renaming failed:', err.message);
    return 0;
  } finally {
    running = false;
  }
}

let soonTimer = null;

// Called after anything that might have added or changed an image.
function scheduleSoon() {
  if (soonTimer) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    runPass();
  }, SOON_DELAY_MS);
  soonTimer.unref();
}

function start() {
  // Cleanup waits for the first pass so the migration has finished before
  // anything is judged unused.
  runPass().then(runCleanup);
  setInterval(runPass, PASS_INTERVAL_MS).unref();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS).unref();
}

module.exports = { start, scheduleSoon, runPass, planRenames, applyRenames, removeUnusedImages, slugify, TARGETS };
