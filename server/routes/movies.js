const express = require('express');
const path = require('path');
const db = require('../db');
const { addMovieFromTmdbId } = require('../lib/addMovie');
const { cacheImageFromUrl } = require('../lib/images');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToMovie(row) {
  return {
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    cast: row.cast ? JSON.parse(row.cast) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    watched: !!row.watched,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    backdrop_url: row.backdrop_file ? `/posters/${row.backdrop_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'year', 'added_at', 'personal_rating', 'tmdb_rating', 'runtime']);

router.get('/', (req, res) => {
  const { q, genre, format, watched, sort = 'title', dir = 'asc' } = req.query;
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
  if (watched === 'true') sql += ' AND watched = 1';
  if (watched === 'false') sql += ' AND watched = 0';
  const col = SORT_COLUMNS.has(sort) ? sort : 'title';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${col} ${direction}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToMovie));
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

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
