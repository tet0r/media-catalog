const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { addTvShowFromTvdbId, refreshTvShowMetadata, rematchTvShow } = require('../lib/addTvShow');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');
const bulkRefreshTv = require('../lib/bulkRefreshTv');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToShow(row) {
  return {
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    cast: row.cast ? JSON.parse(row.cast) : [],
    production_companies: row.production_companies ? JSON.parse(row.production_companies) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    watched: !!row.watched,
    poster_url: row.poster_file ? `/posters/${row.poster_file}` : null,
    backdrop_url: row.backdrop_file ? `/posters/${row.backdrop_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'year', 'added_at', 'personal_rating', 'tvdb_score', 'runtime']);

router.get('/', (req, res) => {
  const { q, genre, format, rating, watched, sort = 'title', dir = 'asc' } = req.query;
  let sql = 'SELECT * FROM tv_shows WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND title LIKE ?';
    params.push(`%${q}%`);
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
  res.json(rows.map(rowToShow));
});

// Defined ahead of the /:id routes below so these literal paths are never
// shadowed by the param route.
router.post('/refresh-all', (req, res) => {
  const started = bulkRefreshTv.startBulkRefresh();
  if (!started) return res.status(409).json({ error: 'A bulk refresh is already running' });
  res.status(202).json({ started: true });
});

router.get('/refresh-all/status', (req, res) => {
  res.json(bulkRefreshTv.getStatus());
});

// Wipes the whole collection — used by Settings' "Clear Library". See
// routes/movies.js's clear-all for why scan_pending/tv_show_ignored/
// tv_scan_status are left alone.
router.post('/clear-all', (req, res) => {
  const rows = db.prepare('SELECT poster_file, backdrop_file FROM tv_shows').all();
  for (const row of rows) {
    for (const file of [row.poster_file, row.backdrop_file]) {
      if (!file) continue;
      try { fs.unlinkSync(path.join(DATA_DIR, 'posters', file)); } catch { /* already gone, fine */ }
    }
  }
  const info = db.prepare('DELETE FROM tv_shows').run();
  res.json({ ok: true, count: info.changes });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToShow(row));
});

router.post('/', async (req, res) => {
  try {
    const { tvdb_id, file_path, format } = req.body;
    if (!tvdb_id) return res.status(400).json({ error: 'tvdb_id is required' });
    const row = await addTvShowFromTvdbId(tvdb_id, { filePath: file_path || null, format: format || null });
    res.status(201).json(rowToShow(row));
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
  db.prepare(`UPDATE tv_shows SET ${updates.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToShow(row));
});

async function setImage(req, res, column) {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare(`UPDATE tv_shows SET ${column} = ? WHERE id = ?`).run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToShow(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

router.put('/:id/poster', (req, res) => setImage(req, res, 'poster_file'));
router.put('/:id/backdrop', (req, res) => setImage(req, res, 'backdrop_file'));

// Raw image bytes in the request body, same pattern as the other media
// types' /:id/*/upload.
router.put('/:id/poster/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE tv_shows SET poster_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToShow(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const existing = db.prepare('SELECT tvdb_id FROM tv_shows WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.tvdb_id) return res.status(400).json({ error: 'This show has no TheTVDB match to refresh from' });
    const row = await refreshTvShowMetadata(req.params.id, existing.tvdb_id);
    res.json(rowToShow(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Points this show at a completely different TheTVDB entry — found via a
// fresh search right on the show's own page, for when the original match
// was wrong. Unlike /refresh (re-fetches the same tvdb_id), this takes a
// new tvdb_id picked from that search.
router.post('/:id/rematch', async (req, res) => {
  try {
    const { tvdb_id } = req.body;
    if (!tvdb_id) return res.status(400).json({ error: 'tvdb_id is required' });
    const existing = db.prepare('SELECT id FROM tv_shows WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const row = await rematchTvShow(req.params.id, tvdb_id);
    res.json(rowToShow(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tv_shows WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
