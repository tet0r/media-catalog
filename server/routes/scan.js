const express = require('express');
const db = require('../db');
const tmdb = require('../lib/tmdb');
const { addMovieFromTmdbId } = require('../lib/addMovie');
const { walk, guessTitleYear } = require('../lib/scanner');
const { normalizeForMatch } = require('../lib/titleMatch');

const router = express.Router();

// MOVIES_DIR can be a single path or a comma-separated list, so a library
// split across multiple network shares/mounts can each be their own volume
// (e.g. /movies, /movies2, /movies3) instead of forcing everything under
// one mount point.
const MOVIES_DIRS = (process.env.MOVIES_DIR || '/movies')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function walkAllRoots(dirs) {
  const entries = [];
  for (const root of dirs) {
    for (const file of walk(root)) {
      entries.push({ file, root });
    }
  }
  return entries;
}

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
    matched=@matched, pending=@pending, skipped=@skipped, message=@message WHERE id = 1`).run(merged);
}

function toCandidateList(results) {
  return results.slice(0, 5).map((c) => ({
    tmdb_id: c.id,
    title: c.title,
    year: c.release_date ? c.release_date.slice(0, 4) : null,
    poster_url: c.poster_path ? `${tmdb.IMG_BASE}/w200${c.poster_path}` : null,
  }));
}

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0 });
  try {
    const entries = walkAllRoots(MOVIES_DIRS);
    setStatus({ files_found: entries.length, message: `Found ${entries.length} video files. Matching against TMDB...` });

    const existingPaths = new Set(
      db.prepare('SELECT file_path FROM movies WHERE file_path IS NOT NULL').all().map((r) => r.file_path)
    );
    const existingPending = new Set(
      db.prepare('SELECT file_path FROM scan_pending').all().map((r) => r.file_path)
    );

    let matched = 0, pending = 0, skipped = 0;

    for (const { file, root } of entries) {
      if (existingPaths.has(file) || existingPending.has(file)) {
        skipped++;
        setStatus({ matched, pending, skipped });
        continue;
      }

      const { title, year } = guessTitleYear(file, root);
      if (!title) {
        skipped++;
        setStatus({ matched, pending, skipped });
        continue;
      }

      let candidates = [];
      try {
        candidates = await tmdb.searchMovies(db, title, year);
      } catch (err) {
        setStatus({ running: 0, message: `Scan stopped: ${err.message}` });
        return;
      }

      const exact = candidates.find((c) => {
        const cYear = c.release_date ? parseInt(c.release_date.slice(0, 4), 10) : null;
        return normalizeForMatch(c.title) === normalizeForMatch(title) && (!year || !cYear || Math.abs(cYear - year) <= 1);
      });

      if (exact && year) {
        const row = await addMovieFromTmdbId(exact.id, { filePath: file, format: 'File' });
        matched++;
        void row;
      } else {
        db.prepare(
          'INSERT OR IGNORE INTO scan_pending (file_path, guessed_title, guessed_year, candidates) VALUES (?,?,?,?)'
        ).run(file, title, year, JSON.stringify(toCandidateList(candidates)));
        pending++;
      }
      setStatus({ matched, pending, skipped });
    }

    setStatus({ running: 0, last_run: new Date().toISOString(), message: 'Scan complete.' });
  } catch (err) {
    setStatus({ running: 0, message: `Scan failed: ${err.message}` });
  }
}

router.post('/', (req, res) => {
  const status = db.prepare('SELECT * FROM scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { tmdb_id, skip } = req.body;
    if (!skip && tmdb_id) {
      await addMovieFromTmdbId(tmdb_id, { filePath: pendingRow.file_path, format: 'File' });
    }
    db.prepare('DELETE FROM scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
