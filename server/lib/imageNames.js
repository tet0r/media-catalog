const fs = require('fs');
const path = require('path');
const db = require('../db');
const { IMAGE_FOLDERS, groupImageFolder } = require('./images');
const { folderFor } = require('./imageFolders');

// Cached images used to be named by hash (custom-9f2c….jpg) or by TMDB's own
// random file names, all in one folder, so a posters folder — or an image
// backup of it — said nothing about what each picture is. Every image now sits
// in a folder for its media type and kind of image, under a name built from the
// item it belongs to:
//
//   Movies/Posters/the-matrix-1999-poster.jpg    Movies/Backdrops/the-matrix-1999-backdrop.jpg
//   Games/Covers/zelda-ii-the-adventure-of-link-nes-cover.jpg
//   Audiobooks/Covers/project-hail-mary-2021-cover.jpg   Movies/Collections/star-wars-collection-poster.jpg
//
// New images are written straight into the right folder by lib/images.js
// (the folder is chosen where the image is fetched, uploaded, or copied). The
// name comes from the item, so it's put on by a separate pass over the
// database: it renames the file and updates the row. That same pass also moves
// anything that's in the wrong place, which is how a library from before the
// folders existed gets sorted — so a new item, an edited title, a freshly
// chosen or uploaded picture, and every image that predates this feature all
// end up in the same layout. It runs at startup (the one-time migration), a
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

// table, column, which folder the image belongs in (a fixed folder, or a
// function of the row), what the image is, the name parts for the item's slug,
// and the word used in the slug if all the parts are empty.
const TARGETS = [
  { table: 'movies', column: 'poster_file', folder: (r) => folderFor(IMAGE_FOLDERS.moviePoster, 'movies', r.file_path), category: 'poster', fallback: 'movie', parts: (r) => [r.title, r.year] },
  { table: 'movies', column: 'backdrop_file', folder: (r) => folderFor(IMAGE_FOLDERS.movieBackdrop, 'movies', r.file_path), category: 'backdrop', fallback: 'movie', parts: (r) => [r.title, r.year] },
  { table: 'tv_shows', column: 'poster_file', folder: (r) => folderFor(IMAGE_FOLDERS.tvPoster, 'tv_shows', r.file_path), category: 'poster', fallback: 'tv-show', parts: (r) => [r.title, r.year] },
  { table: 'tv_shows', column: 'backdrop_file', folder: (r) => folderFor(IMAGE_FOLDERS.tvBackdrop, 'tv_shows', r.file_path), category: 'backdrop', fallback: 'tv-show', parts: (r) => [r.title, r.year] },
  { table: 'audiobooks', column: 'cover_file', folder: (r) => folderFor(IMAGE_FOLDERS.audiobook, 'audiobooks', r.file_path), category: 'cover', fallback: 'audiobook', parts: (r) => [r.title, r.year] },
  { table: 'ebooks', column: 'cover_file', folder: (r) => folderFor(IMAGE_FOLDERS.ebook, 'ebooks', r.file_path), category: 'cover', fallback: 'ebook', parts: (r) => [r.title, r.year] },
  { table: 'comics', column: 'cover_file', folder: (r) => folderFor(IMAGE_FOLDERS.comic, 'comics', r.file_path), category: 'cover', fallback: 'comic', parts: (r) => [r.series || r.title, r.issue_number, r.year] },
  { table: 'albums', column: 'cover_file', folder: (r) => folderFor(IMAGE_FOLDERS.album, 'albums', r.file_path), category: 'cover', fallback: 'album', parts: (r) => [r.artist, r.title] },
  { table: 'vinyl_records', column: 'cover_file', folder: IMAGE_FOLDERS.vinyl, category: 'cover', fallback: 'vinyl', parts: (r) => [r.artist, r.title, r.year] },
  { table: 'games', column: 'cover_file', folder: IMAGE_FOLDERS.game, category: 'cover', fallback: 'game', parts: (r) => [r.title, r.platform] },
  { table: 'collections', column: 'poster_file', folder: IMAGE_FOLDERS.movieCollection, category: 'poster', fallback: 'collection', parts: (r) => [r.name], collection: true },
  {
    table: 'group_images', column: 'cover_file', fallback: 'group', parts: (r) => [r.group_key],
    folder: (r) => groupImageFolder(r.media_type),
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
  const folder = typeof target.folder === 'function' ? target.folder(row) : target.folder;
  return { slug, category, folder };
}

function readRows(target) {
  return db.prepare(`SELECT rowid AS _rid, * FROM ${target.table} WHERE ${target.column} IS NOT NULL AND ${target.column} != ''`).all();
}

// Stored paths are relative to the posters folder with forward slashes
// ('Movies/Posters/the-matrix-1999-poster.jpg'). Anything that could point
// outside it is never touched.
const isSafeRelativePath = (p) => typeof p === 'string' && p !== '' && !p.includes('\\') && !p.startsWith('/') && !p.split('/').some((seg) => seg === '..' || seg === '');
const fullPath = (postersDir, rel) => path.join(postersDir, ...rel.split('/'));

// Works out where each image should be — its folder, and a name built from the
// item — without touching anything. Returns [{ target, rid, from, to, shared }].
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
      if (!isSafeRelativePath(from)) continue;
      const { slug, category, folder } = describe(target, row);
      const ext = path.extname(from).toLowerCase() || '.jpg';
      const alreadyThere = new RegExp(`^${escapeRegExp(folder)}/${escapeRegExp(slug)}(-\\d+)?-${escapeRegExp(category)}(-\\d+)?${escapeRegExp(ext)}$`);
      if (alreadyThere.test(from)) continue;
      // Nothing on disk to rename (e.g. images lost to a wiped data folder) —
      // leave the row alone; Refetch All Images / a restore can fill it in.
      if (!fs.existsSync(fullPath(postersDir, from))) continue;

      const candidates = [`${folder}/${slug}-${category}${ext}`, `${folder}/${slug}-${row._rid}-${category}${ext}`];
      for (let n = 2; n < 50; n++) candidates.push(`${folder}/${slug}-${row._rid}-${category}-${n}${ext}`);
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
      if (!isReferenced(file)) fs.unlinkSync(fullPath(POSTERS_DIR(), file));
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
  const src = fullPath(postersDir, op.from);
  const dest = fullPath(postersDir, op.to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
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
          if (!isReferenced(to)) fs.unlinkSync(fullPath(postersDir, to));
        } else if (!fs.existsSync(fullPath(postersDir, from))) {
          fs.renameSync(fullPath(postersDir, to), fullPath(postersDir, from));
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

// Every file some item currently uses (as stored: a path relative to the
// posters folder).
function referencedFiles() {
  const files = new Set();
  for (const t of TARGETS) {
    for (const row of db.prepare(`SELECT DISTINCT ${t.column} AS f FROM ${t.table} WHERE ${t.column} IS NOT NULL AND ${t.column} != ''`).all()) {
      files.add(row.f);
    }
  }
  return files;
}

// Every file under a folder, as paths relative to it with forward slashes.
function listFilesRecursive(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...listFilesRecursive(dir, rel));
    else if (e.isFile()) files.push(rel);
  }
  return files;
}

// Removes folders left empty (images moved to another folder, deleted items).
// Only ones that have sat untouched for a while: a download creates its folder
// a moment before it writes the file into it.
function removeEmptyFolders(dir, isRoot = true) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) removeEmptyFolders(path.join(dir, e.name), false);
  }
  if (isRoot) return;
  try {
    if (fs.readdirSync(dir).length === 0 && Date.now() - fs.statSync(dir).mtimeMs > UNUSED_MIN_AGE_MS) fs.rmdirSync(dir);
  } catch {
    /* in use or already gone — fine */
  }
}

function removeIfOlderThan(dir, rel, minAgeMs) {
  try {
    const full = fullPath(dir, rel);
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
// In the image backup folder: ONLY unused files left over from before the
// current layout — old hash-style names, and loose files in the top level that
// now have a copy in a folder (the flat names from before images were sorted
// into folders) — and only after a longer wait. The backup is otherwise
// add-only on purpose, since it exists to survive the data folder being
// wiped, so it never loses an image that merely isn't referenced right now.
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
  for (const rel of listFilesRecursive(postersDir)) {
    // Half-written temp files, and old names still inside their grace period.
    if (referenced.has(rel) || pendingDeletes.has(rel) || rel.includes('.tmp-') || rel.endsWith('.part')) continue;
    if (removeIfOlderThan(postersDir, rel, UNUSED_MIN_AGE_MS)) result.posters++;
  }
  removeEmptyFolders(postersDir);

  const backupDir = require('./imageBackup').IMAGE_BACKUP_DIR;
  const backupFiles = listFilesRecursive(backupDir);
  const inFolders = new Set(backupFiles.filter((f) => f.includes('/')).map((f) => path.posix.basename(f)));
  for (const rel of backupFiles) {
    if (rel.includes('/') || referenced.has(rel) || rel.includes('.tmp-') || rel.endsWith('.part')) continue;
    if (!OLD_STYLE_NAME.test(rel) && !inFolders.has(rel)) continue;
    if (removeIfOlderThan(backupDir, rel, BACKUP_UNUSED_MIN_AGE_MS)) result.backup++;
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
    // The first big batch is the one-time migration of an existing library
    // (into folders, with names built from the items). It only moves files and
    // rewrites file paths in the database, but that's still a bulk change to
    // the database, so take a backup first — once.
    if (ops.length >= BACKUP_THRESHOLD) {
      const flag = db.prepare("SELECT value FROM settings WHERE key = 'image_folders_backup_done'").get();
      if (!flag) {
        try {
          await require('./backup').createBackup();
        } catch {
          /* a failed safety copy shouldn't stop the move; it's reversible by Refetch/restore */
        }
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('image_folders_backup_done', '1')").run();
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
