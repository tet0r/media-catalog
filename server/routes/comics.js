const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { addComicFromExternalId, refreshComicMetadata, rematchComic } = require('../lib/addComic');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');
const bulkRefresh = require('../lib/bulkRefreshComics');
const groupImages = require('../lib/groupImages');
const { renameTextColumnGroup } = require('../lib/groupRename');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToComic(row) {
  return {
    ...row,
    creators: row.creators ? JSON.parse(row.creators) : [],
    cover_url: row.cover_file ? `/posters/${row.cover_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'series', 'year', 'added_at']);

router.get('/', (req, res) => {
  const { q, sort = 'series', dir = 'asc' } = req.query;
  let sql = 'SELECT * FROM comics WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (title LIKE ? OR series LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const col = SORT_COLUMNS.has(sort) ? sort : 'series';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  // Secondary sort by issue_number so a series always lists its issues in
  // order rather than however SQLite happens to break sort ties.
  sql += ` ORDER BY ${col} ${direction}, CAST(issue_number AS REAL) ASC`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToComic));
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
// comic_scan_pending/comic_ignored/comic_scan_status: those are about
// specific files on disk, not the collection's contents.
router.post('/clear-all', (req, res) => {
  const rows = db.prepare('SELECT cover_file FROM comics').all();
  for (const row of rows) {
    if (!row.cover_file) continue;
    try { fs.unlinkSync(path.join(DATA_DIR, 'posters', row.cover_file)); } catch { /* already gone, fine */ }
  }
  // Also drop any custom series pictures (group_images) — otherwise a
  // re-added series later would inherit a picture from before the wipe.
  for (const coverFile of groupImages.clearAll('comic_series')) {
    try { fs.unlinkSync(path.join(DATA_DIR, 'posters', coverFile)); } catch { /* already gone, fine */ }
  }
  const info = db.prepare('DELETE FROM comics').run();
  res.json({ ok: true, count: info.changes });
});

// Also defined ahead of /:id — "series" would otherwise be swallowed as
// an :id value.
router.get('/series/images', (req, res) => {
  res.json(groupImages.getImageMap('comic_series'));
});

// Renaming a single series (sourceNames.length === 1) and merging several
// into one (sourceNames.length > 1) are the same operation — see
// lib/groupRename.js.
router.post('/series/rename', (req, res) => {
  const { sourceNames, targetName } = req.body;
  if (!Array.isArray(sourceNames) || sourceNames.length === 0 || !targetName || !targetName.trim()) {
    return res.status(400).json({ error: 'sourceNames (a non-empty array) and targetName are required' });
  }
  const updated = renameTextColumnGroup('comics', 'series', 'comic_series', sourceNames, targetName.trim());
  res.json({ ok: true, updated });
});

router.put('/series/:name/cover', async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    groupImages.setImage('comic_series', req.params.name, filename);
    res.json({ ok: true, cover_url: `/posters/${filename}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/series/:name/cover/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    groupImages.setImage('comic_series', req.params.name, filename);
    res.json({ ok: true, cover_url: `/posters/${filename}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToComic(row));
});

router.post('/', async (req, res) => {
  try {
    const { issue_id, source } = req.body;
    if (!issue_id) return res.status(400).json({ error: 'issue_id is required' });
    const row = await addComicFromExternalId(source || 'comicvine', issue_id);
    res.status(201).json(rowToComic(row));
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
  db.prepare(`UPDATE comics SET ${updates.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToComic(row));
});

router.put('/:id/cover', async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare('UPDATE comics SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToComic(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raw image bytes in the request body, same pattern as movies'/ebooks'
// /:id/*/upload.
router.put('/:id/cover/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE comics SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToComic(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const existing = db.prepare('SELECT metadata_source, external_id FROM comics WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.external_id) return res.status(400).json({ error: 'This comic has no catalog match to refresh from' });
    const row = await refreshComicMetadata(req.params.id, existing.metadata_source, existing.external_id);
    res.json(rowToComic(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Points this comic at a completely different issue — possibly from a
// different source entirely — found via a fresh search right on the
// comic's own page, for when the original match was wrong. Unlike
// /refresh (re-fetches the same issue id from the same source), this
// takes a new source+id pair picked from that search.
router.post('/:id/rematch', async (req, res) => {
  try {
    const { issue_id, source } = req.body;
    if (!issue_id) return res.status(400).json({ error: 'issue_id is required' });
    const existing = db.prepare('SELECT id FROM comics WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const row = await rematchComic(req.params.id, source || 'comicvine', issue_id);
    res.json(rowToComic(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM comics WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
