const express = require('express');
const db = require('../db');

const router = express.Router();

const DEFAULT_AUTO_SCAN_INTERVAL_MINUTES = 60;

function upsert(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settingsKey = map.tmdb_api_key || '';
  const source = settingsKey ? 'settings' : (process.env.TMDB_API_KEY ? 'env' : 'none');
  res.json({
    tmdb_api_key: settingsKey,
    tmdb_api_key_source: source,
    auto_scan_enabled: map.auto_scan_enabled === 'true',
    auto_scan_interval_minutes: Number(map.auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    auto_prune_missing: map.auto_prune_missing === 'true',
  });
});

router.put('/', (req, res) => {
  const { tmdb_api_key, auto_scan_enabled, auto_scan_interval_minutes, auto_prune_missing } = req.body;
  if (typeof tmdb_api_key === 'string') upsert('tmdb_api_key', tmdb_api_key);
  if (typeof auto_scan_enabled === 'boolean') upsert('auto_scan_enabled', auto_scan_enabled ? 'true' : 'false');
  if (typeof auto_prune_missing === 'boolean') upsert('auto_prune_missing', auto_prune_missing ? 'true' : 'false');
  if (auto_scan_interval_minutes !== undefined && auto_scan_interval_minutes !== null && auto_scan_interval_minutes !== '') {
    const minutes = Number(auto_scan_interval_minutes);
    if (Number.isFinite(minutes) && minutes > 0) upsert('auto_scan_interval_minutes', String(minutes));
  }
  res.json({ ok: true });
});

module.exports = router;
