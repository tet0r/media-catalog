const express = require('express');
const fs = require('fs');
const db = require('../db');
const audible = require('../lib/audible');
const { addAudiobookFromAsin } = require('../lib/addAudiobook');
const { walkAllRoots, guessTitle } = require('../lib/audiobookScanner');
const { normalizeForMatch } = require('../lib/titleMatch');

const router = express.Router();

// Same comma-separated multi-root support as MOVIES_DIR.
const AUDIOBOOKS_DIRS = (process.env.AUDIOBOOKS_DIR || '/audiobooks')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM audiobook_scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE audiobook_scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
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
// safety net as movies' pruneMissingFiles — a root returning zero groups
// usually means a network mount briefly failed, not that everything under
// it was deleted. fs.existsSync works uniformly here whether file_path is
// an .m4b file or a multi-part book's folder.
function pruneMissingFiles(groups) {
  const rootsWithGroups = new Set(groups.map((g) => g.root));
  const healthyRoots = AUDIOBOOKS_DIRS.filter((root) => rootsWithGroups.has(root));

  let removed = 0;
  const books = db.prepare('SELECT id, file_path FROM audiobooks WHERE file_path IS NOT NULL').all();
  for (const book of books) {
    const root = healthyRoots.find((r) => book.file_path.startsWith(r));
    if (!root || fs.existsSync(book.file_path)) continue;
    db.prepare('DELETE FROM audiobooks WHERE id = ?').run(book.id);
    removed++;
  }

  const pendingItems = db.prepare('SELECT id, file_path FROM audiobook_scan_pending').all();
  for (const p of pendingItems) {
    const root = healthyRoots.find((r) => p.file_path.startsWith(r));
    if (!root || fs.existsSync(p.file_path)) continue;
    db.prepare('DELETE FROM audiobook_scan_pending WHERE id = ?').run(p.id);
  }

  return removed;
}

function toCandidateList(results) {
  return results.slice(0, 5).map((c) => ({
    asin: c.asin,
    title: c.title,
    authors: c.authors,
    year: c.release_date ? c.release_date.slice(0, 4) : null,
    cover_url: c.cover_url,
  }));
}

// A small gap between external requests — partly courtesy to an unofficial
// API this app makes a lot of calls to across a real library, partly to
// reduce the odds of tripping whatever burst-rate heuristic might be
// behind a request getting refused outright (see the network-error
// handling below).
const REQUEST_DELAY_MS = 200;

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0, removed: 0, errored: 0 });
  try {
    const groups = walkAllRoots(AUDIOBOOKS_DIRS);
    setStatus({ files_found: groups.length, message: `Found ${groups.length} audiobooks. Matching against Audible...` });

    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM audiobooks WHERE file_path IS NOT NULL').all().map((r) => r.file_path)
    );
    const existingPending = new Set(
      db.prepare('SELECT file_path FROM audiobook_scan_pending').all().map((r) => r.file_path)
    );

    let matched = 0, pending = 0, skipped = 0, errored = 0;
    let lastError = null;

    for (const group of groups) {
      if (existingPaths.has(group.path) || existingPending.has(group.path)) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      const title = guessTitle(group);
      if (!title) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      // Failures here (network blip, DNS hiccup, Audible/Audnexus briefly
      // unreachable) are common at real-library scale — hundreds of
      // sequential external requests will occasionally have one go wrong.
      // One failure used to abort the *entire* scan; now it's counted and
      // skipped so the other 694 books still get a chance.
      try {
        const candidates = await audible.searchAudiobooks(title);
        await sleep(REQUEST_DELAY_MS);

        // No year signal to cross-check here (unlike movies) — audiobook
        // folder/file names don't reliably carry a release year the way
        // "Title (Year)" movie naming does, so an exact normalized-title
        // match against Audible's own relevance-sorted results is treated
        // as confident enough to auto-add.
        const exact = candidates.find((c) => normalizeForMatch(c.title) === normalizeForMatch(title));
        const sourceFormat = group.kind === 'multi' ? 'MP3' : 'M4B';

        if (exact) {
          await addAudiobookFromAsin(exact.asin, { filePath: group.path, fileParts: group.parts, sourceFormat });
          await sleep(REQUEST_DELAY_MS);
          matched++;
        } else {
          db.prepare(
            'INSERT OR IGNORE INTO audiobook_scan_pending (file_path, file_parts, source_format, guessed_title, candidates) VALUES (?,?,?,?,?)'
          ).run(group.path, JSON.stringify(group.parts), sourceFormat, title, JSON.stringify(toCandidateList(candidates)));
          pending++;
        }
      } catch (err) {
        errored++;
        lastError = err.message;
      }
      setStatus({ matched, pending, skipped, errored });
    }

    let removed = 0;
    if (getSetting('audiobook_auto_prune_missing') === 'true') {
      setStatus({ message: 'Checking for audiobooks whose files are gone...' });
      removed = pruneMissingFiles(groups);
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
  const status = db.prepare('SELECT * FROM audiobook_scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM audiobook_scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM audiobook_scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({
    ...r,
    file_parts: JSON.parse(r.file_parts || '[]'),
    candidates: JSON.parse(r.candidates || '[]'),
  })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM audiobook_scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { asin, skip } = req.body;
    if (!skip && asin) {
      await addAudiobookFromAsin(asin, {
        filePath: pendingRow.file_path,
        fileParts: JSON.parse(pendingRow.file_parts || '[]'),
        sourceFormat: pendingRow.source_format,
      });
    }
    db.prepare('DELETE FROM audiobook_scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runScan = runScan;
