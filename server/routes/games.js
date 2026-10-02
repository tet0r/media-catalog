const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { cacheImageFromUrl, cacheImageBuffer } = require('../lib/images');
const { runSync } = require('../lib/gamesSync');
const groupImages = require('../lib/groupImages');
const { renameTextColumnGroup } = require('../lib/groupRename');
const wikipedia = require('../lib/wikipedia');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function rowToGame(row) {
  return {
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    cover_url: row.cover_file ? `/posters/${row.cover_file}` : null,
  };
}

const SORT_COLUMNS = new Set(['title', 'platform', 'release_date', 'added_at']);

router.get('/', (req, res) => {
  const { q, sort = 'title', dir = 'asc' } = req.query;
  let sql = 'SELECT * FROM games WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (title LIKE ? OR platform LIKE ? OR source LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const col = SORT_COLUMNS.has(sort) ? sort : 'title';
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${col} ${direction}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToGame));
});

// Defined ahead of the /:id routes below so these literal paths are never
// shadowed by the param route.
router.post('/sync', (req, res) => {
  const status = db.prepare('SELECT * FROM games_sync_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A sync is already running' });
  runSync();
  res.status(202).json({ started: true });
});

router.get('/sync/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM games_sync_status WHERE id = 1').get());
});

// Wipes the local mirror — used by Settings' "Clear Library". Items come
// back on the next sync (this app never touches the actual LaunchBox
// installation), so this is really "start the local copy over" rather than
// a true collection wipe.
router.post('/clear-all', (req, res) => {
  const rows = db.prepare('SELECT cover_file FROM games').all();
  for (const row of rows) {
    if (!row.cover_file) continue;
    try { fs.unlinkSync(path.join(DATA_DIR, 'posters', row.cover_file)); } catch { /* already gone, fine */ }
  }
  for (const mediaType of ['game_platform', 'game_store']) {
    for (const coverFile of groupImages.clearAll(mediaType)) {
      try { fs.unlinkSync(path.join(DATA_DIR, 'posters', coverFile)); } catch { /* already gone, fine */ }
    }
  }
  const info = db.prepare('DELETE FROM games').run();
  res.json({ ok: true, count: info.changes });
});

// Platform groups and Store (LaunchBox "Source") groups work identically —
// a text column on games shared by many rows, with an optional custom
// picture per distinct value (group_images) and rename/merge via
// lib/groupRename.js — so both are registered from one definition. Defined
// ahead of /:id so these literal paths are never shadowed by the param
// route.
//
// A rename here survives the next "Sync from LaunchBox" too — see
// gamesSync.js's upsertGame.
function registerGroupRoutes({ segment, column, mediaType }) {
  router.get(`/${segment}/images`, (req, res) => {
    res.json(groupImages.getImageMap(mediaType));
  });

  // A relevant picture to set for a group — no free, keyless image API
  // specifically for game platforms or storefronts exists, so Wikipedia (a
  // real console/platform/store almost always has its own page with a
  // logo or photo) is the only source offered here, same fallback every
  // other group-image search also offers alongside its own specialized
  // source.
  router.get(`/${segment}/search-images`, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.json([]);
      res.json(await wikipedia.searchImages(q));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Renaming a single group (sourceNames.length === 1) and merging several
  // into one (sourceNames.length > 1) are the same operation — see
  // lib/groupRename.js.
  router.post(`/${segment}/rename`, (req, res) => {
    const { sourceNames, targetName } = req.body;
    if (!Array.isArray(sourceNames) || sourceNames.length === 0 || !targetName || !targetName.trim()) {
      return res.status(400).json({ error: 'sourceNames (a non-empty array) and targetName are required' });
    }
    const updated = renameTextColumnGroup('games', column, mediaType, sourceNames, targetName.trim());
    res.json({ ok: true, updated });
  });

  router.put(`/${segment}/:name/cover`, async (req, res) => {
    try {
      const { image_url } = req.body;
      if (!image_url) return res.status(400).json({ error: 'image_url is required' });
      const filename = await cacheImageFromUrl(DATA_DIR, image_url);
      groupImages.setImage(mediaType, req.params.name, filename);
      res.json({ ok: true, cover_url: `/posters/${filename}` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put(`/${segment}/:name/cover/upload`, express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
    try {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
      const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
      groupImages.setImage(mediaType, req.params.name, filename);
      res.json({ ok: true, cover_url: `/posters/${filename}` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Reverts a platform/store back to the auto-collage.
  router.delete(`/${segment}/:name/cover`, (req, res) => {
    const coverFile = groupImages.getImage(mediaType, req.params.name);
    if (coverFile) {
      try { fs.unlinkSync(path.join(DATA_DIR, 'posters', coverFile)); } catch { /* already gone, fine */ }
    }
    groupImages.deleteImage(mediaType, req.params.name);
    res.json({ ok: true });
  });
}

registerGroupRoutes({ segment: 'platforms', column: 'platform', mediaType: 'game_platform' });
registerGroupRoutes({ segment: 'stores', column: 'source', mediaType: 'game_store' });

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToGame(row));
});

router.put('/:id/cover', async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const filename = await cacheImageFromUrl(DATA_DIR, image_url);
    db.prepare('UPDATE games SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToGame(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raw image bytes in the request body, same pattern as the other media
// types' /:id/*/upload.
router.put('/:id/cover/upload', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Uploaded file must be an image' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No image data received' });
    const filename = await cacheImageBuffer(DATA_DIR, req.body, contentType);
    db.prepare('UPDATE games SET cover_file = ? WHERE id = ?').run(filename, req.params.id);
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToGame(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Removes the local copy only — it reappears on the next sync unless it's
// also removed from LaunchBox itself, since LaunchBox (not this app) is
// the source of truth for what's in the library.
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
