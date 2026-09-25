const express = require('express');
const fs = require('fs');
const db = require('../db');
const tvdb = require('../lib/tvdb');
const { addTvShowFromTvdbId } = require('../lib/addTvShow');
const { walkShowFolders, guessTitleYear } = require('../lib/tvScanner');
const { normalizeForMatch } = require('../lib/titleMatch');

const router = express.Router();

// Same comma-separated multi-root support as MOVIES_DIR/ALBUMS_DIR/etc.
const TV_DIRS = (process.env.TV_DIR || '/tv')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function walkAllRoots(dirs) {
  const entries = [];
  for (const root of dirs) {
    for (const folder of walkShowFolders(root)) {
      entries.push({ file: folder.path, name: folder.name, root });
    }
  }
  return entries;
}

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM tv_scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE tv_scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
    matched=@matched, pending=@pending, skipped=@skipped, removed=@removed, message=@message WHERE id = 1`).run(merged);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Same "only prune for a root that actually produced folders this scan"
// safety net as pruneMissingFiles in routes/scan.js — a network mount
// blipping to empty shouldn't wipe out the whole TV collection.
function pruneMissingFiles(entries) {
  const rootsWithFolders = new Set(entries.map((e) => e.root));
  const healthyRoots = TV_DIRS.filter((root) => rootsWithFolders.has(root));

  let removed = 0;
  const shows = db.prepare('SELECT id, file_path FROM tv_shows WHERE file_path IS NOT NULL').all();
  for (const show of shows) {
    const root = healthyRoots.find((r) => show.file_path.startsWith(r));
    if (!root || fs.existsSync(show.file_path)) continue;
    db.prepare('DELETE FROM tv_shows WHERE id = ?').run(show.id);
    removed++;
  }

  const pendingItems = db.prepare('SELECT id, file_path FROM tv_scan_pending').all();
  for (const p of pendingItems) {
    const root = healthyRoots.find((r) => p.file_path.startsWith(r));
    if (!root || fs.existsSync(p.file_path)) continue;
    db.prepare('DELETE FROM tv_scan_pending WHERE id = ?').run(p.id);
  }

  return removed;
}

function toCandidateList(results) {
  return results.slice(0, 5).map((c) => ({
    tvdb_id: c.tvdb_id,
    title: c.name,
    year: c.year || null,
    poster_url: c.image_url || null,
  }));
}

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0, removed: 0 });
  try {
    const entries = walkAllRoots(TV_DIRS);
    setStatus({ files_found: entries.length, message: `Found ${entries.length} show folders. Matching against TheTVDB...` });

    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM tv_shows WHERE file_path IS NOT NULL').all().map((r) => r.file_path)
    );
    const existingPending = new Set(
      db.prepare('SELECT file_path FROM tv_scan_pending').all().map((r) => r.file_path)
    );
    const ignoredPaths = new Set(
      db.prepare('SELECT file_path FROM tv_show_ignored').all().map((r) => r.file_path)
    );

    let matched = 0, pending = 0, skipped = 0;

    for (const { file, name } of entries) {
      if (existingPaths.has(file) || existingPending.has(file) || ignoredPaths.has(file)) {
        skipped++;
        setStatus({ matched, pending, skipped });
        continue;
      }

      const { title, year } = guessTitleYear(name);
      if (!title) {
        skipped++;
        setStatus({ matched, pending, skipped });
        continue;
      }

      let candidates = [];
      try {
        candidates = await tvdb.searchSeries(db, title, year);
      } catch (err) {
        setStatus({ running: 0, message: `Scan stopped: ${err.message}` });
        return;
      }

      const exact = candidates.find((c) => {
        const cYear = c.year ? parseInt(c.year, 10) : null;
        return normalizeForMatch(c.name) === normalizeForMatch(title) && (!year || !cYear || Math.abs(cYear - year) <= 1);
      });

      if (exact && year) {
        await addTvShowFromTvdbId(exact.tvdb_id, { filePath: file, format: 'File' });
        matched++;
      } else {
        db.prepare(
          'INSERT OR IGNORE INTO tv_scan_pending (file_path, guessed_title, guessed_year, candidates) VALUES (?,?,?,?)'
        ).run(file, title, year, JSON.stringify(toCandidateList(candidates)));
        pending++;
      }
      setStatus({ matched, pending, skipped });
    }

    let removed = 0;
    if (getSetting('tv_auto_prune_missing') === 'true') {
      setStatus({ message: 'Checking for shows whose folder is gone...' });
      removed = pruneMissingFiles(entries);
    }

    setStatus({ running: 0, last_run: new Date().toISOString(), removed, message: 'Scan complete.' });
  } catch (err) {
    setStatus({ running: 0, message: `Scan failed: ${err.message}` });
  }
}

router.post('/', (req, res) => {
  const status = db.prepare('SELECT * FROM tv_scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM tv_scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM tv_scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM tv_scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { tvdb_id, skip } = req.body;
    if (!skip && tvdb_id) {
      await addTvShowFromTvdbId(tvdb_id, { filePath: pendingRow.file_path, format: 'File' });
    }
    db.prepare('DELETE FROM tv_scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unlike a plain "skip" (dismisses this review only), this permanently
// excludes the folder path.
router.post('/pending/:id/ignore', (req, res) => {
  const pendingRow = db.prepare('SELECT * FROM tv_scan_pending WHERE id = ?').get(req.params.id);
  if (!pendingRow) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO tv_show_ignored (file_path, guessed_title, guessed_year) VALUES (?, ?, ?)')
    .run(pendingRow.file_path, pendingRow.guessed_title, pendingRow.guessed_year);
  db.prepare('DELETE FROM tv_scan_pending WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const batchSkip = db.transaction((ids) => {
  const deletePending = db.prepare('DELETE FROM tv_scan_pending WHERE id = ?');
  for (const id of ids) deletePending.run(id);
});

router.post('/pending/batch-skip', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  batchSkip(ids);
  res.json({ ok: true, count: ids.length });
});

const batchIgnore = db.transaction((rows) => {
  const insertIgnored = db.prepare('INSERT OR IGNORE INTO tv_show_ignored (file_path, guessed_title, guessed_year) VALUES (?, ?, ?)');
  const deletePending = db.prepare('DELETE FROM tv_scan_pending WHERE id = ?');
  for (const row of rows) {
    insertIgnored.run(row.file_path, row.guessed_title, row.guessed_year);
    deletePending.run(row.id);
  }
});

router.post('/pending/batch-ignore', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM tv_scan_pending WHERE id IN (${placeholders})`).all(...ids);
  batchIgnore(rows);
  res.json({ ok: true, count: rows.length });
});

router.get('/ignored', (req, res) => {
  res.json(db.prepare('SELECT * FROM tv_show_ignored ORDER BY created_at DESC').all());
});

router.delete('/ignored/:id', (req, res) => {
  db.prepare('DELETE FROM tv_show_ignored WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.runScan = runScan;
