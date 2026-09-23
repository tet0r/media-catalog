const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const openlibrary = require('../lib/openlibrary');
const { addEbookFromExternalId } = require('../lib/addEbook');
const { walk, guessTitle } = require('../lib/ebookScanner');
const { normalizeForMatch } = require('../lib/titleMatch');

const router = express.Router();

// Same comma-separated multi-root support as MOVIES_DIR/AUDIOBOOKS_DIR —
// commonly the same network share as the audiobooks, just a different
// sub-path.
const EBOOKS_DIRS = (process.env.EBOOKS_DIR || '/ebooks')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function walkAllRoots(dirs) {
  const entries = [];
  for (const root of dirs) {
    for (const file of walk(root)) entries.push({ file, root });
  }
  return entries;
}

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM ebook_scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE ebook_scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
    matched=@matched, pending=@pending, skipped=@skipped, removed=@removed, errored=@errored, message=@message WHERE id = 1`).run(merged);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Same "only prune under a root that actually produced files this scan"
// safety net as movies'/audiobooks' pruneMissingFiles.
function pruneMissingFiles(entries) {
  const rootsWithFiles = new Set(entries.map((e) => e.root));
  const healthyRoots = EBOOKS_DIRS.filter((root) => rootsWithFiles.has(root));

  let removed = 0;
  const rows = db.prepare('SELECT id, file_path FROM ebooks WHERE file_path IS NOT NULL').all();
  for (const row of rows) {
    const root = healthyRoots.find((r) => row.file_path.startsWith(r));
    if (!root || fs.existsSync(row.file_path)) continue;
    db.prepare('DELETE FROM ebooks WHERE id = ?').run(row.id);
    removed++;
  }

  const pendingItems = db.prepare('SELECT id, file_path FROM ebook_scan_pending').all();
  for (const p of pendingItems) {
    const root = healthyRoots.find((r) => p.file_path.startsWith(r));
    if (!root || fs.existsSync(p.file_path)) continue;
    db.prepare('DELETE FROM ebook_scan_pending WHERE id = ?').run(p.id);
  }

  return removed;
}

function toCandidateList(results) {
  return results.slice(0, 5).map((c) => ({
    key: c.key,
    title: c.title,
    authors: c.authors,
    year: c.year,
    cover_url: c.cover_url,
  }));
}

// Same courtesy delay as audiobookScan.js's REQUEST_DELAY_MS, applied here
// to Open Library instead of Audible/Audnexus.
const REQUEST_DELAY_MS = 200;

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0, removed: 0, errored: 0 });
  try {
    const entries = walkAllRoots(EBOOKS_DIRS);
    setStatus({ files_found: entries.length, message: `Found ${entries.length} ebooks. Matching against Open Library...` });

    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM ebooks WHERE file_path IS NOT NULL').all().map((r) => r.file_path)
    );
    const existingPending = new Set(
      db.prepare('SELECT file_path FROM ebook_scan_pending').all().map((r) => r.file_path)
    );
    const ignoredPaths = new Set(
      db.prepare('SELECT file_path FROM ebook_ignored').all().map((r) => r.file_path)
    );

    let matched = 0, pending = 0, skipped = 0, errored = 0;
    let lastError = null;

    for (const { file } of entries) {
      if (existingPaths.has(file) || existingPending.has(file) || ignoredPaths.has(file)) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      const title = guessTitle(file);
      if (!title) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      const format = path.extname(file).slice(1).toLowerCase();

      // Same "count and skip rather than abort the whole scan" handling as
      // audiobookScan.js — a network blip against hundreds of sequential
      // Open Library requests shouldn't cost every book after it a chance.
      try {
        const candidates = await openlibrary.searchBooks(title);
        await sleep(REQUEST_DELAY_MS);

        // No year signal to cross-check here (ebook filenames don't
        // reliably carry one) — an exact normalized-title match against
        // Open Library's own relevance-sorted results is treated as
        // confident enough to auto-add, same reasoning as audiobooks.
        const exact = candidates.find((c) => normalizeForMatch(c.title) === normalizeForMatch(title));

        if (exact) {
          await addEbookFromExternalId(exact.key, { filePath: file, fileFormat: format });
          await sleep(REQUEST_DELAY_MS);
          matched++;
        } else {
          db.prepare(
            'INSERT OR IGNORE INTO ebook_scan_pending (file_path, guessed_title, guessed_format, candidates) VALUES (?,?,?,?)'
          ).run(file, title, format, JSON.stringify(toCandidateList(candidates)));
          pending++;
        }
      } catch (err) {
        errored++;
        lastError = err.message;
      }
      setStatus({ matched, pending, skipped, errored });
    }

    let removed = 0;
    if (getSetting('ebook_auto_prune_missing') === 'true') {
      setStatus({ message: 'Checking for ebooks whose files are gone...' });
      removed = pruneMissingFiles(entries);
    }

    const message = errored
      ? `Scan complete — ${errored} book(s) failed (most recent error: ${lastError}). Run the scan again to retry those.`
      : 'Scan complete.';
    setStatus({ running: 0, last_run: new Date().toISOString(), removed, message });
  } catch (err) {
    setStatus({ running: 0, message: `Scan failed: ${err.message}` });
  }
}

router.post('/', (req, res) => {
  const status = db.prepare('SELECT * FROM ebook_scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM ebook_scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM ebook_scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM ebook_scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { key, skip } = req.body;
    if (!skip && key) {
      await addEbookFromExternalId(key, { filePath: pendingRow.file_path, fileFormat: pendingRow.guessed_format });
    }
    db.prepare('DELETE FROM ebook_scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unlike a plain "skip" (dismisses this review only — the path isn't
// recorded anywhere, so the next scan finds it again), this permanently
// excludes the path.
router.post('/pending/:id/ignore', (req, res) => {
  const pendingRow = db.prepare('SELECT * FROM ebook_scan_pending WHERE id = ?').get(req.params.id);
  if (!pendingRow) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO ebook_ignored (file_path, guessed_title) VALUES (?, ?)')
    .run(pendingRow.file_path, pendingRow.guessed_title);
  db.prepare('DELETE FROM ebook_scan_pending WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const batchSkip = db.transaction((ids) => {
  const deletePending = db.prepare('DELETE FROM ebook_scan_pending WHERE id = ?');
  for (const id of ids) deletePending.run(id);
});

router.post('/pending/batch-skip', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  batchSkip(ids);
  res.json({ ok: true, count: ids.length });
});

const batchIgnore = db.transaction((rows) => {
  const insertIgnored = db.prepare('INSERT OR IGNORE INTO ebook_ignored (file_path, guessed_title) VALUES (?, ?)');
  const deletePending = db.prepare('DELETE FROM ebook_scan_pending WHERE id = ?');
  for (const row of rows) {
    insertIgnored.run(row.file_path, row.guessed_title);
    deletePending.run(row.id);
  }
});

router.post('/pending/batch-ignore', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM ebook_scan_pending WHERE id IN (${placeholders})`).all(...ids);
  batchIgnore(rows);
  res.json({ ok: true, count: rows.length });
});

router.get('/ignored', (req, res) => {
  res.json(db.prepare('SELECT * FROM ebook_ignored ORDER BY created_at DESC').all());
});

router.delete('/ignored/:id', (req, res) => {
  db.prepare('DELETE FROM ebook_ignored WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.runScan = runScan;
