const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const comicvine = require('../lib/comicvine');
const { addComicFromIssueId } = require('../lib/addComic');
const { walk } = require('../lib/comicScanner');
const { parseSeriesAndIssue } = require('../lib/comicMatch');

const router = express.Router();

// Same comma-separated multi-root support as the other _DIR vars.
const COMICS_DIRS = (process.env.COMICS_DIR || '/comics')
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
  const cur = db.prepare('SELECT * FROM comic_scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE comic_scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
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
// safety net as the other scanners' pruneMissingFiles.
function pruneMissingFiles(entries) {
  const rootsWithFiles = new Set(entries.map((e) => e.root));
  const healthyRoots = COMICS_DIRS.filter((root) => rootsWithFiles.has(root));

  let removed = 0;
  const rows = db.prepare('SELECT id, file_path FROM comics WHERE file_path IS NOT NULL').all();
  for (const row of rows) {
    const root = healthyRoots.find((r) => row.file_path.startsWith(r));
    if (!root || fs.existsSync(row.file_path)) continue;
    db.prepare('DELETE FROM comics WHERE id = ?').run(row.id);
    removed++;
  }

  const pendingItems = db.prepare('SELECT id, file_path FROM comic_scan_pending').all();
  for (const p of pendingItems) {
    const root = healthyRoots.find((r) => p.file_path.startsWith(r));
    if (!root || fs.existsSync(p.file_path)) continue;
    db.prepare('DELETE FROM comic_scan_pending WHERE id = ?').run(p.id);
  }

  return removed;
}

// Courtesy delay between ComicVine calls, same idea as the other
// scanners' REQUEST_DELAY_MS — larger here since a single comic can cost
// several calls (a volume search plus one issue lookup per candidate
// volume), against a tighter hourly rate limit than TMDB/TVDB/Open
// Library.
const REQUEST_DELAY_MS = 500;

// A small maxVolumes for scanning (unlike a manual/Needs-Review search,
// which can afford to check more) — keeps a big scan's ComicVine call
// count from growing unboundedly against the hourly rate limit.
const SCAN_MAX_VOLUMES = 3;

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0, removed: 0, errored: 0 });
  try {
    const entries = walkAllRoots(COMICS_DIRS);
    setStatus({ files_found: entries.length, message: `Found ${entries.length} comics. Matching against ComicVine...` });

    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM comics WHERE file_path IS NOT NULL').all().map((r) => r.file_path)
    );
    const existingPending = new Set(
      db.prepare('SELECT file_path FROM comic_scan_pending').all().map((r) => r.file_path)
    );
    const ignoredPaths = new Set(
      db.prepare('SELECT file_path FROM comic_ignored').all().map((r) => r.file_path)
    );

    let matched = 0, pending = 0, skipped = 0, errored = 0;
    let lastError = null;

    for (const { file } of entries) {
      if (existingPaths.has(file) || existingPending.has(file) || ignoredPaths.has(file)) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      const format = path.extname(file).slice(1).toLowerCase();
      const base = path.basename(file, path.extname(file));
      const { series, issueNumber } = parseSeriesAndIssue(base);

      if (!series || !issueNumber) {
        // Nothing confident to search ComicVine with at all (e.g. no
        // issue number could be guessed) — straight to Needs Review
        // rather than spend a request on a search that can't possibly
        // land on one exact issue.
        db.prepare(
          'INSERT OR IGNORE INTO comic_scan_pending (file_path, guessed_series, guessed_issue_number, guessed_format, candidates) VALUES (?,?,?,?,?)'
        ).run(file, series, issueNumber, format, '[]');
        pending++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      // Same "count and skip rather than abort the whole scan" handling
      // as the other scanners — a network blip against hundreds of
      // sequential ComicVine requests shouldn't cost every comic after it
      // a chance.
      try {
        const hits = await comicvine.searchIssues(db, series, issueNumber, { maxVolumes: SCAN_MAX_VOLUMES });
        await sleep(REQUEST_DELAY_MS);

        // Exactly one hit across the top candidate volumes is treated as
        // confident enough to auto-add — the volume+issue-number lookup
        // is already a precise match by construction, so ambiguity here
        // means more than one series plausibly has this exact issue
        // number, not a fuzzy near-miss.
        if (hits.length === 1) {
          await addComicFromIssueId(hits[0].id, { filePath: file, format });
          matched++;
        } else {
          db.prepare(
            'INSERT OR IGNORE INTO comic_scan_pending (file_path, guessed_series, guessed_issue_number, guessed_format, candidates) VALUES (?,?,?,?,?)'
          ).run(file, series, issueNumber, format, JSON.stringify(hits.slice(0, 8)));
          pending++;
        }
      } catch (err) {
        errored++;
        lastError = err.message;
      }
      setStatus({ matched, pending, skipped, errored });
    }

    let removed = 0;
    if (getSetting('comic_auto_prune_missing') === 'true') {
      setStatus({ message: 'Checking for comics whose files are gone...' });
      removed = pruneMissingFiles(entries);
    }

    const message = errored
      ? `Scan complete — ${errored} comic(s) failed (most recent error: ${lastError}). Run the scan again to retry those.`
      : 'Scan complete.';
    setStatus({ running: 0, last_run: new Date().toISOString(), removed, message });
  } catch (err) {
    setStatus({ running: 0, message: `Scan failed: ${err.message}` });
  }
}

router.post('/', (req, res) => {
  const status = db.prepare('SELECT * FROM comic_scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM comic_scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM comic_scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM comic_scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { issue_id, skip } = req.body;
    if (!skip && issue_id) {
      await addComicFromIssueId(issue_id, { filePath: pendingRow.file_path, format: pendingRow.guessed_format });
    }
    db.prepare('DELETE FROM comic_scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unlike a plain "skip" (dismisses this review only — the path isn't
// recorded anywhere, so the next scan finds it again), this permanently
// excludes the path.
router.post('/pending/:id/ignore', (req, res) => {
  const pendingRow = db.prepare('SELECT * FROM comic_scan_pending WHERE id = ?').get(req.params.id);
  if (!pendingRow) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO comic_ignored (file_path, guessed_series) VALUES (?, ?)')
    .run(pendingRow.file_path, pendingRow.guessed_series);
  db.prepare('DELETE FROM comic_scan_pending WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const batchSkip = db.transaction((ids) => {
  const deletePending = db.prepare('DELETE FROM comic_scan_pending WHERE id = ?');
  for (const id of ids) deletePending.run(id);
});

router.post('/pending/batch-skip', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  batchSkip(ids);
  res.json({ ok: true, count: ids.length });
});

const batchIgnore = db.transaction((rows) => {
  const insertIgnored = db.prepare('INSERT OR IGNORE INTO comic_ignored (file_path, guessed_series) VALUES (?, ?)');
  const deletePending = db.prepare('DELETE FROM comic_scan_pending WHERE id = ?');
  for (const row of rows) {
    insertIgnored.run(row.file_path, row.guessed_series);
    deletePending.run(row.id);
  }
});

router.post('/pending/batch-ignore', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM comic_scan_pending WHERE id IN (${placeholders})`).all(...ids);
  batchIgnore(rows);
  res.json({ ok: true, count: rows.length });
});

router.get('/ignored', (req, res) => {
  res.json(db.prepare('SELECT * FROM comic_ignored ORDER BY created_at DESC').all());
});

router.delete('/ignored/:id', (req, res) => {
  db.prepare('DELETE FROM comic_ignored WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.runScan = runScan;
