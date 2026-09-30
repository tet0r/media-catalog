const express = require('express');
const path = require('path');
const db = require('../db');
const { getMemberMovies } = require('../lib/collections');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function miniMovie(row) {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    personal_rating: row.personal_rating,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    removable: row.removable === true,
  };
}

function rowToCollection(row, { includeAllMovies = false } = {}) {
  const movies = getMemberMovies(row).map(miniMovie);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    movie_count: movies.length,
    movies: includeAllMovies ? movies : movies.slice(0, 4),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM collections ORDER BY name COLLATE NOCASE').all();
  // Franchise collections only surface once 2+ movies actually belong to
  // them — a single automatic match isn't really a "collection", and the
  // row stays around either way so a later matching movie makes it
  // reappear without redoing any setup. Manual collections always show,
  // even with just one movie (or none), since the user made them and put
  // things in them on purpose.
  const result = rows.map((r) => rowToCollection(r)).filter((c) => c.type === 'manual' || c.movie_count > 1);
  res.json(result);
});

// Defined ahead of the /:id route below so this literal path is never
// shadowed by the param route.
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare("INSERT INTO collections (name, type) VALUES (?, 'manual')").run(name.trim());
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(rowToCollection(row, { includeAllMovies: true }));
});

// Defined ahead of /:id too — merging two or more collections into one:
// every movie in each source (via getMemberMovies, so a franchise
// collection's automatic TMDB matches get folded in as explicit
// collection_movies rows on the target, same as a manual addition would
// be) moves into targetId, the sources are deleted, and the target is
// renamed to targetName. The target keeps its existing type/
// tmdb_collection_id/poster — merging a manual collection into a
// franchise one (or vice versa) just means the survivor's own membership
// rule applies going forward, on top of whatever got folded in.
router.post('/merge', (req, res) => {
  const { sourceIds, targetId, targetName } = req.body;
  if (!Array.isArray(sourceIds) || sourceIds.length < 2 || !targetId || !targetName || !targetName.trim()) {
    return res.status(400).json({ error: 'sourceIds (2+ collection ids), targetId, and targetName are required' });
  }
  if (!sourceIds.map(String).includes(String(targetId))) {
    return res.status(400).json({ error: 'targetId must be one of sourceIds' });
  }
  const target = db.prepare('SELECT * FROM collections WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Target collection not found' });

  const insertMovie = db.prepare('INSERT OR IGNORE INTO collection_movies (collection_id, movie_id) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const id of sourceIds) {
      if (String(id) === String(targetId)) continue;
      const source = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
      if (!source) continue;
      for (const movie of getMemberMovies(source)) insertMovie.run(targetId, movie.id);
      db.prepare('DELETE FROM collection_movies WHERE collection_id = ?').run(id);
      db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    }
    db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(targetName.trim(), targetId);
  });
  tx();
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(targetId);
  res.json(rowToCollection(row, { includeAllMovies: true }));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToCollection(row, { includeAllMovies: true }));
});

router.put('/:id/cover', async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare('UPDATE collections SET poster_file = ? WHERE id = ?').run(filename, req.params.id);
    res.json(rowToCollection({ ...row, poster_file: filename }, { includeAllMovies: true }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raw image bytes in the request body, same pattern as every other media
// type's /:id/*/upload. Once set this way, syncFranchiseCollection never
// touches poster_file again for this collection (it only ever sets a
// poster on first creating the row — see lib/collections.js), so a
// custom picture on a franchise collection is safe from being overwritten
// by a later movie add/refresh.
router.put('/:id/cover/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE collections SET poster_file = ? WHERE id = ?').run(filename, req.params.id);
    res.json(rowToCollection({ ...row, poster_file: filename }, { includeAllMovies: true }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Works for any type — renaming a franchise collection doesn't touch its
// TMDB matching at all (still keyed off tmdb_collection_id), it just lets
// you call it something other than TMDB's own name for it.
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name.trim(), row.id);
  res.json(rowToCollection({ ...row, name: name.trim() }, { includeAllMovies: true }));
});

// Works for any type — for franchise/studio this is the same as disabling it
// in Settings (the row just disappears; it comes back on its own if a movie
// still matches it next time metadata syncs).
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM collection_movies WHERE collection_id = ?').run(req.params.id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Works for any type — for a franchise collection this adds the movie on
// top of whatever TMDB already matches automatically (see
// lib/collections.js's getMemberMovies), for when TMDB doesn't officially
// list a movie in that collection but it belongs there anyway.
router.post('/:id/movies', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { movie_id } = req.body;
  if (!movie_id) return res.status(400).json({ error: 'movie_id is required' });
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movie_id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  db.prepare('INSERT OR IGNORE INTO collection_movies (collection_id, movie_id) VALUES (?, ?)').run(row.id, movie_id);
  res.status(201).json(rowToCollection(row, { includeAllMovies: true }));
});

// Only ever removes a manual addition (collection_movies) — a movie TMDB
// automatically matches to a franchise collection isn't stored there in
// the first place, so this is a harmless no-op for one of those; it stays
// in the collection until its own tmdb_collection_id changes.
router.delete('/:id/movies/:movieId', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM collection_movies WHERE collection_id = ? AND movie_id = ?').run(row.id, req.params.movieId);
  res.json(rowToCollection(row, { includeAllMovies: true }));
});

module.exports = router;
