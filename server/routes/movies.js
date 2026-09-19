const express = require('express');
const path = require('path');
const db = require('../db');
const { addMovieFromTmdbId, refreshMovieMetadata } = require('../lib/addMovie');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');
const bulkRefresh = require('../lib/bulkRefresh');
const { IMG_BASE } = require('../lib/tmdb');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToMovie(row) {
  return {
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    cast: row.cast
      ? JSON.parse(row.cast).map((c) => ({
          ...c,
          profile_url: c.profile_path ? `${IMG_BASE}/w185${c.profile_path}` : null,
        }))
      : [],
    crew: row.crew ? JSON.parse(row.crew) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    production_companies: row.production_companies ? JSON.parse(row.production_companies) : [],
    spoken_languages: row.spoken_languages ? JSON.parse(row.spoken_languages) : [],
    watched: !!row.watched,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    backdrop_url: row.backdrop_file ? `/posters/${row.backdrop_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'year', 'added_at', 'personal_rating', 'tmdb_rating', 'runtime']);

router.get('/', (req, res) => {
  const { q, genre, format, rating, watched, sort = 'title', dir = 'asc' } = req.query;
  let sql = 'SELECT * FROM movies WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (title LIKE ? OR original_title LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (genre) {
    sql += ' AND genres LIKE ?';
    params.push(`%${genre}%`);
  }
  if (format) {
    sql += ' AND format = ?';
    params.push(format);
  }
  if (rating) {
    // "NR" also catches movies with no certification at all (no US release
    // entry, or one with an empty certification), not just an explicit "NR".
    if (rating === 'NR') {
      sql += " AND (content_rating IS NULL OR content_rating = '' OR content_rating = 'NR')";
    } else {
      sql += ' AND content_rating = ?';
      params.push(rating);
    }
  }
  if (watched === 'true') sql += ' AND watched = 1';
  if (watched === 'false') sql += ' AND watched = 0';
  const col = SORT_COLUMNS.has(sort) ? sort : 'title';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${col} ${direction}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToMovie));
});

// Defined ahead of the /:id routes below so these literal paths are never
// shadowed by the param route.
router.post('/refresh-all', (req, res) => {
  const started = bulkRefresh.startBulkRefresh();
  if (!started) return res.status(409).json({ error: 'A bulk refresh is already running' });
  res.status(202).json({ started: true });
});

router.get('/refresh-all/status', (req, res) => {
  res.json(bulkRefresh.getStatus());
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToMovie(row));
});

router.post('/', async (req, res) => {
  try {
    const { tmdb_id, file_path, format } = req.body;
    if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id is required' });
    const row = await addMovieFromTmdbId(tmdb_id, { filePath: file_path || null, format: format || null });
    res.status(201).json(rowToMovie(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const EDITABLE_FIELDS = [
  'format', 'location', 'purchase_date', 'purchase_price', 'purchase_store',
  'personal_rating', 'notes', 'loaned_to', 'watched', 'tags', 'title',
];

router.put('/:id', (req, res) => {
  const updates = [];
  const params = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in req.body) {
      updates.push(`${key} = @${key}`);
      if (key === 'tags') params[key] = JSON.stringify(req.body[key] || []);
      else if (key === 'watched') params[key] = req.body[key] ? 1 : 0;
      else params[key] = req.body[key];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
  params.id = req.params.id;
  db.prepare(`UPDATE movies SET ${updates.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToMovie(row));
});

async function setImage(req, res, column) {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare(`UPDATE movies SET ${column} = ? WHERE id = ?`).run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToMovie(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

router.put('/:id/poster', (req, res) => setImage(req, res, 'poster_file'));
router.put('/:id/backdrop', (req, res) => setImage(req, res, 'backdrop_file'));

// Raw image bytes in the request body (not JSON), for uploading a poster
// file directly instead of picking one from ThePosterDB/TMDB. Scoped to
// this one route rather than mounted globally, since the rest of the API
// expects JSON bodies.
router.put('/:id/poster/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE movies SET poster_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToMovie(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const existing = db.prepare('SELECT tmdb_id FROM movies WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.tmdb_id) return res.status(400).json({ error: 'This movie has no TMDB match to refresh from' });
    const row = await refreshMovieMetadata(req.params.id, existing.tmdb_id);
    res.json(rowToMovie(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
