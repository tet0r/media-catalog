const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { addEbookFromExternalId, refreshEbookMetadata } = require('../lib/addEbook');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');
const bulkRefresh = require('../lib/bulkRefreshEbooks');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToEbook(row) {
  return {
    ...row,
    authors: row.authors ? JSON.parse(row.authors) : [],
    genres: row.genres ? JSON.parse(row.genres) : [],
    cover_url: row.cover_file ? `/posters/${row.cover_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'year', 'added_at', 'page_count']);

router.get('/', (req, res) => {
  const { q, sort = 'title', dir = 'asc' } = req.query;
  let sql = 'SELECT * FROM ebooks WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (title LIKE ? OR authors LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const col = SORT_COLUMNS.has(sort) ? sort : 'title';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${col} ${direction}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToEbook));
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

// Wipes the whole collection — used by Settings' "Clear Library". Deletes
// every row plus its cached cover file. Doesn't touch
// ebook_scan_pending/ebook_ignored/ebook_scan_status: those are about
// specific files on disk, not the collection's contents.
router.post('/clear-all', (req, res) => {
  const rows = db.prepare('SELECT cover_file FROM ebooks').all();
  for (const row of rows) {
    if (!row.cover_file) continue;
    try { fs.unlinkSync(path.join(DATA_DIR, 'posters', row.cover_file)); } catch { /* already gone, fine */ }
  }
  const info = db.prepare('DELETE FROM ebooks').run();
  res.json({ ok: true, count: info.changes });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM ebooks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToEbook(row));
});

router.post('/', async (req, res) => {
  try {
    const { external_id } = req.body;
    if (!external_id) return res.status(400).json({ error: 'external_id is required' });
    const row = await addEbookFromExternalId(external_id);
    res.status(201).json(rowToEbook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const EDITABLE_FIELDS = ['title'];

router.put('/:id', (req, res) => {
  const updates = [];
  const params = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in req.body) {
      updates.push(`${key} = @${key}`);
      params[key] = req.body[key];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
  params.id = req.params.id;
  db.prepare(`UPDATE ebooks SET ${updates.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM ebooks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToEbook(row));
});

router.put('/:id/cover', async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare('UPDATE ebooks SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM ebooks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToEbook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raw image bytes in the request body, same pattern as movies'/audiobooks'
// /:id/*/upload.
router.put('/:id/cover/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE ebooks SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM ebooks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToEbook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const existing = db.prepare('SELECT external_id FROM ebooks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.external_id) return res.status(400).json({ error: 'This ebook has no external match to refresh from' });
    const row = await refreshEbookMetadata(req.params.id, existing.external_id);
    res.json(rowToEbook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ebooks WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
