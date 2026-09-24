const express = require('express');
const fs = require('fs');
const db = require('../db');
const musicbrainz = require('../lib/musicbrainz');
const lastfm = require('../lib/lastfm');
const { addAlbumFromExternalId } = require('../lib/addAlbum');
const { walkAllRoots, guessArtistAlbum } = require('../lib/albumScanner');
const { readAudioTags } = require('../lib/audioTags');
const { normalizeForMatch } = require('../lib/titleMatch');

const router = express.Router();

// Same comma-separated multi-root support as MOVIES_DIR/AUDIOBOOKS_DIR/
// EBOOKS_DIR — commonly the same network share as those, just a different
// sub-path.
const ALBUMS_DIRS = (process.env.ALBUMS_DIR || '/albums')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function setStatus(fields) {
  const cur = db.prepare('SELECT * FROM album_scan_status WHERE id = 1').get();
  const merged = { ...cur, ...fields };
  db.prepare(`UPDATE album_scan_status SET running=@running, last_run=@last_run, files_found=@files_found,
    matched=@matched, pending=@pending, skipped=@skipped, removed=@removed, errored=@errored, message=@message WHERE id = 1`).run(merged);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Same "only prune under a root that actually produced groups this scan"
// safety net as movies'/audiobooks'/ebooks' pruneMissingFiles.
function pruneMissingFiles(groups) {
  const rootsWithGroups = new Set(groups.map((g) => g.root));
  const healthyRoots = ALBUMS_DIRS.filter((root) => rootsWithGroups.has(root));

  let removed = 0;
  const rows = db.prepare('SELECT id, file_path FROM albums WHERE file_path IS NOT NULL').all();
  for (const row of rows) {
    const root = healthyRoots.find((r) => row.file_path.startsWith(r));
    if (!root || fs.existsSync(row.file_path)) continue;
    db.prepare('DELETE FROM albums WHERE id = ?').run(row.id);
    removed++;
  }

  const pendingItems = db.prepare('SELECT id, file_path FROM album_scan_pending').all();
  for (const p of pendingItems) {
    const root = healthyRoots.find((r) => p.file_path.startsWith(r));
    if (!root || fs.existsSync(p.file_path)) continue;
    db.prepare('DELETE FROM album_scan_pending WHERE id = ?').run(p.id);
  }

  return removed;
}

function toCandidateList(results) {
  return results.slice(0, 5).map((c) => ({
    key: c.key,
    title: c.title,
    artist: c.artist,
    year: c.year,
  }));
}

// Every path recorded across albums/album_scan_pending/album_ignored,
// parsed from either the plural disc_paths column (when present) or just
// the singular file_path (for rows from before that column existed, or a
// normal non-multi-disc entry that never got one).
function allKnownPaths(rows) {
  const set = new Set();
  for (const row of rows) {
    if (row.disc_paths) {
      try {
        for (const p of JSON.parse(row.disc_paths)) set.add(p);
        continue;
      } catch { /* fall through to file_path below */ }
    }
    if (row.file_path) set.add(row.file_path);
  }
  return set;
}

async function runScan() {
  setStatus({ running: 1, message: 'Scanning folders...', files_found: 0, matched: 0, pending: 0, skipped: 0, removed: 0, errored: 0 });
  try {
    const groups = walkAllRoots(ALBUMS_DIRS);

    // Last.fm is the default match source, but scanning shouldn't hard-fail
    // on every single album just because a fresh install hasn't set up a
    // (free, but required) Last.fm API key yet — fall back to MusicBrainz
    // (which needs none) for the whole scan instead of erroring per item.
    const useLastfm = !!lastfm.getApiKey(db);
    const source = useLastfm ? 'lastfm' : 'musicbrainz';
    const searchAlbums = (query) => (useLastfm ? lastfm.searchAlbums(db, query) : musicbrainz.searchAlbums(query));

    setStatus({
      files_found: groups.length,
      message: useLastfm
        ? `Found ${groups.length} albums. Matching against Last.fm...`
        : `Found ${groups.length} albums. Matching against MusicBrainz (rate-limited to 1 request/second, so this can take a while)...`,
    });

    const existingPaths = allKnownPaths(
      db.prepare('SELECT file_path, disc_paths FROM albums WHERE file_path IS NOT NULL').all()
    );
    const existingPending = allKnownPaths(
      db.prepare('SELECT file_path, disc_paths FROM album_scan_pending').all()
    );
    const ignoredPaths = allKnownPaths(
      db.prepare('SELECT file_path, disc_paths FROM album_ignored').all()
    );

    let matched = 0, pending = 0, skipped = 0, errored = 0;
    let lastError = null;

    for (const group of groups) {
      // A merged multi-disc group is skipped if ANY of its constituent
      // disc folders is already known — e.g. disc 1 alone was previously
      // added/pending/ignored before disc 2 existed on disk.
      if (group.paths.some((p) => existingPaths.has(p) || existingPending.has(p) || ignoredPaths.has(p))) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      // A track's own embedded tags are more reliable than any folder-name
      // guess — read from the first track (all tracks in an album share
      // the same artist/album tags), falling back to the folder-based
      // guess per-field for whichever one is missing or unreadable.
      const tags = readAudioTags(group.tracks[0]);
      const guessed = guessArtistAlbum(group);
      const artist = tags?.artist || guessed.artist;
      const album = tags?.album || guessed.album;
      if (!album) {
        skipped++;
        setStatus({ matched, pending, skipped, errored });
        continue;
      }

      // Same "count and skip rather than abort the whole scan" handling as
      // audiobookScan.js/ebookScan.js.
      try {
        // Album titles alone are often highly ambiguous (self-titled
        // albums, "Greatest Hits", a bare "IV") — including the guessed
        // artist in the search query (when we have one) is what actually
        // disambiguates, unlike movies/ebooks where a title search alone
        // is usually enough.
        const query = artist ? `${album} ${artist}` : album;
        const candidates = await searchAlbums(query);

        // Requires the artist to match too when we have one, for the same
        // disambiguation reason — an exact title match alone isn't
        // confident enough for something titled "IV".
        const exact = candidates.find((c) => {
          if (normalizeForMatch(c.title) !== normalizeForMatch(album)) return false;
          if (!artist) return true;
          return !!c.artist && normalizeForMatch(c.artist).includes(normalizeForMatch(artist));
        });

        if (exact) {
          await addAlbumFromExternalId(source, exact.key, { filePath: group.path, discPaths: group.paths });
          matched++;
        } else {
          db.prepare(
            'INSERT OR IGNORE INTO album_scan_pending (file_path, guessed_artist, guessed_album, candidates, source, disc_paths) VALUES (?,?,?,?,?,?)'
          ).run(group.path, artist, album, JSON.stringify(toCandidateList(candidates)), source, JSON.stringify(group.paths));
          pending++;
        }
      } catch (err) {
        errored++;
        lastError = err.message;
      }
      setStatus({ matched, pending, skipped, errored });
    }

    let removed = 0;
    if (getSetting('album_auto_prune_missing') === 'true') {
      setStatus({ message: 'Checking for albums whose folder is gone...' });
      removed = pruneMissingFiles(groups);
    }

    const message = errored
      ? `Scan complete — ${errored} album(s) failed (most recent error: ${lastError}). Run the scan again to retry those.`
      : 'Scan complete.';
    setStatus({ running: 0, last_run: new Date().toISOString(), removed, message });
  } catch (err) {
    setStatus({ running: 0, message: `Scan failed: ${err.message}` });
  }
}

router.post('/', (req, res) => {
  const status = db.prepare('SELECT * FROM album_scan_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A scan is already running' });
  runScan();
  res.status(202).json({ started: true });
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM album_scan_status WHERE id = 1').get());
});

router.get('/pending', (req, res) => {
  const rows = db.prepare('SELECT * FROM album_scan_pending ORDER BY created_at DESC').all();
  res.json(rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') })));
});

router.post('/pending/:id/resolve', async (req, res) => {
  try {
    const pendingRow = db.prepare('SELECT * FROM album_scan_pending WHERE id = ?').get(req.params.id);
    if (!pendingRow) return res.status(404).json({ error: 'Not found' });
    const { key, skip, source } = req.body;
    if (!skip && key) {
      const discPaths = pendingRow.disc_paths ? JSON.parse(pendingRow.disc_paths) : [pendingRow.file_path];
      await addAlbumFromExternalId(source || 'musicbrainz', key, { filePath: pendingRow.file_path, discPaths });
    }
    db.prepare('DELETE FROM album_scan_pending WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unlike a plain "skip" (dismisses this review only — the path isn't
// recorded anywhere, so the next scan finds it again), this permanently
// excludes the path.
router.post('/pending/:id/ignore', (req, res) => {
  const pendingRow = db.prepare('SELECT * FROM album_scan_pending WHERE id = ?').get(req.params.id);
  if (!pendingRow) return res.status(404).json({ error: 'Not found' });
  db.prepare('INSERT OR IGNORE INTO album_ignored (file_path, guessed_artist, guessed_album, disc_paths) VALUES (?, ?, ?, ?)')
    .run(pendingRow.file_path, pendingRow.guessed_artist, pendingRow.guessed_album, pendingRow.disc_paths);
  db.prepare('DELETE FROM album_scan_pending WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const batchSkip = db.transaction((ids) => {
  const deletePending = db.prepare('DELETE FROM album_scan_pending WHERE id = ?');
  for (const id of ids) deletePending.run(id);
});

router.post('/pending/batch-skip', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  batchSkip(ids);
  res.json({ ok: true, count: ids.length });
});

const batchIgnore = db.transaction((rows) => {
  const insertIgnored = db.prepare('INSERT OR IGNORE INTO album_ignored (file_path, guessed_artist, guessed_album, disc_paths) VALUES (?, ?, ?, ?)');
  const deletePending = db.prepare('DELETE FROM album_scan_pending WHERE id = ?');
  for (const row of rows) {
    insertIgnored.run(row.file_path, row.guessed_artist, row.guessed_album, row.disc_paths);
    deletePending.run(row.id);
  }
});

router.post('/pending/batch-ignore', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids is required' });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM album_scan_pending WHERE id IN (${placeholders})`).all(...ids);
  batchIgnore(rows);
  res.json({ ok: true, count: rows.length });
});

router.get('/ignored', (req, res) => {
  res.json(db.prepare('SELECT * FROM album_ignored ORDER BY created_at DESC').all());
});

router.delete('/ignored/:id', (req, res) => {
  db.prepare('DELETE FROM album_ignored WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.runScan = runScan;
