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
  };
}

function rowToCollection(row, { includeAllMovies = false } = {}) {
  const movies = getMemberMovies(row).map(miniMovie);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    company_match: row.company_match,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    movie_count: movies.length,
    movies: includeAllMovies ? movies : movies.slice(0, 4),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM collections ORDER BY name COLLATE NOCASE').all();
  // Auto (franchise/studio) collections hide themselves once nothing
  // currently matches — the row stays around so a later matching movie
  // makes them reappear without redoing any setup. Manual collections
  // always show, even empty, since the user made them on purpose.
  const result = rows.map((r) => rowToCollection(r)).filter((c) => c.type === 'manual' || c.movie_count > 0);
  res.json(result);
});

// Defined ahead of the /:id routes below so these literal paths are never
// shadowed by the param route.
router.get('/studio-candidates', (req, res) => {
  const movies = db.prepare('SELECT production_companies FROM movies').all();
  const counts = new Map();
  for (const m of movies) {
    const companies = m.production_companies ? JSON.parse(m.production_companies) : [];
    for (const c of companies) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const enabled = db.prepare("SELECT id, company_match FROM collections WHERE type = 'studio'").all();
  const enabledMap = new Map(enabled.map((c) => [c.company_match, c.id]));
  const list = [...counts.entries()]
    .map(([company, movie_count]) => ({
      company,
      movie_count,
      enabled: enabledMap.has(company),
      collection_id: enabledMap.get(company) || null,
    }))
    .sort((a, b) => b.movie_count - a.movie_count || a.company.localeCompare(b.company));
  res.json(list);
});

router.post('/studio', (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ error: 'company is required' });
  let row = db.prepare("SELECT * FROM collections WHERE type = 'studio' AND company_match = ?").get(company);
  if (!row) {
    const info = db.prepare("INSERT INTO collections (name, type, company_match) VALUES (?, 'studio', ?)").run(company, company);
    row = db.prepare('SELECT * FROM collections WHERE id = ?').get(info.lastInsertRowid);
  }
  res.status(201).json(rowToCollection(row));
});

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

router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.type !== 'manual') return res.status(400).json({ error: 'Only manually-created collections can be renamed' });
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

router.post('/:id/movies', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.type !== 'manual') return res.status(400).json({ error: 'Membership in this collection is automatic' });
  const { movie_id } = req.body;
  if (!movie_id) return res.status(400).json({ error: 'movie_id is required' });
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movie_id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  db.prepare('INSERT OR IGNORE INTO collection_movies (collection_id, movie_id) VALUES (?, ?)').run(row.id, movie_id);
  res.status(201).json(rowToCollection(row, { includeAllMovies: true }));
});

router.delete('/:id/movies/:movieId', (req, res) => {
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.type !== 'manual') return res.status(400).json({ error: 'Membership in this collection is automatic' });
  db.prepare('DELETE FROM collection_movies WHERE collection_id = ? AND movie_id = ?').run(row.id, req.params.movieId);
  res.json(rowToCollection(row, { includeAllMovies: true }));
});

module.exports = router;
