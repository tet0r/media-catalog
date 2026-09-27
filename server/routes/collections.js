const express = require('express');
const db = require('../db');
const { getMemberMovies } = require('../lib/collections');

const router = express.Router();

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

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToCollection(row, { includeAllMovies: true }));
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
