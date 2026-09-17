const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdb_api_key');
  const settingsKey = row ? row.value : '';
  const source = settingsKey ? 'settings' : (process.env.TMDB_API_KEY ? 'env' : 'none');
  res.json({ tmdb_api_key: settingsKey, tmdb_api_key_source: source });
});

router.put('/', (req, res) => {
  const { tmdb_api_key } = req.body;
  if (typeof tmdb_api_key === 'string') {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run('tmdb_api_key', tmdb_api_key);
  }
  res.json({ ok: true });
});

module.exports = router;
