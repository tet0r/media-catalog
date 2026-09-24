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
    audiobook_auto_scan_enabled: map.audiobook_auto_scan_enabled === 'true',
    audiobook_auto_scan_interval_minutes: Number(map.audiobook_auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    audiobook_auto_prune_missing: map.audiobook_auto_prune_missing === 'true',
    ebook_auto_scan_enabled: map.ebook_auto_scan_enabled === 'true',
    ebook_auto_scan_interval_minutes: Number(map.ebook_auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    ebook_auto_prune_missing: map.ebook_auto_prune_missing === 'true',
    album_auto_scan_enabled: map.album_auto_scan_enabled === 'true',
    album_auto_scan_interval_minutes: Number(map.album_auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    album_auto_prune_missing: map.album_auto_prune_missing === 'true',
    discogs_username: map.discogs_username || '',
    discogs_token: map.discogs_token || '',
    discogs_source: map.discogs_username && map.discogs_token
      ? 'settings'
      : (process.env.DISCOGS_USERNAME && process.env.DISCOGS_TOKEN ? 'env' : 'none'),
    vinyl_auto_sync_enabled: map.vinyl_auto_sync_enabled === 'true',
    vinyl_auto_sync_interval_minutes: Number(map.vinyl_auto_sync_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    lastfm_api_key: map.lastfm_api_key || '',
    lastfm_api_key_source: map.lastfm_api_key ? 'settings' : (process.env.LASTFM_API_KEY ? 'env' : 'none'),
    games_auto_sync_enabled: map.games_auto_sync_enabled === 'true',
    games_auto_sync_interval_minutes: Number(map.games_auto_sync_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    launchbox_dir_configured: !!process.env.LAUNCHBOX_DIR,
  });
});

function upsertInterval(key, value) {
  if (value === undefined || value === null || value === '') return;
  const minutes = Number(value);
  if (Number.isFinite(minutes) && minutes > 0) upsert(key, String(minutes));
}

router.put('/', (req, res) => {
  const {
    tmdb_api_key, auto_scan_enabled, auto_scan_interval_minutes, auto_prune_missing,
    audiobook_auto_scan_enabled, audiobook_auto_scan_interval_minutes, audiobook_auto_prune_missing,
    ebook_auto_scan_enabled, ebook_auto_scan_interval_minutes, ebook_auto_prune_missing,
    album_auto_scan_enabled, album_auto_scan_interval_minutes, album_auto_prune_missing,
    discogs_username, discogs_token, vinyl_auto_sync_enabled, vinyl_auto_sync_interval_minutes,
    lastfm_api_key, games_auto_sync_enabled, games_auto_sync_interval_minutes,
  } = req.body;
  if (typeof tmdb_api_key === 'string') upsert('tmdb_api_key', tmdb_api_key);
  if (typeof auto_scan_enabled === 'boolean') upsert('auto_scan_enabled', auto_scan_enabled ? 'true' : 'false');
  if (typeof auto_prune_missing === 'boolean') upsert('auto_prune_missing', auto_prune_missing ? 'true' : 'false');
  upsertInterval('auto_scan_interval_minutes', auto_scan_interval_minutes);
  if (typeof audiobook_auto_scan_enabled === 'boolean') upsert('audiobook_auto_scan_enabled', audiobook_auto_scan_enabled ? 'true' : 'false');
  if (typeof audiobook_auto_prune_missing === 'boolean') upsert('audiobook_auto_prune_missing', audiobook_auto_prune_missing ? 'true' : 'false');
  upsertInterval('audiobook_auto_scan_interval_minutes', audiobook_auto_scan_interval_minutes);
  if (typeof ebook_auto_scan_enabled === 'boolean') upsert('ebook_auto_scan_enabled', ebook_auto_scan_enabled ? 'true' : 'false');
  if (typeof ebook_auto_prune_missing === 'boolean') upsert('ebook_auto_prune_missing', ebook_auto_prune_missing ? 'true' : 'false');
  upsertInterval('ebook_auto_scan_interval_minutes', ebook_auto_scan_interval_minutes);
  if (typeof album_auto_scan_enabled === 'boolean') upsert('album_auto_scan_enabled', album_auto_scan_enabled ? 'true' : 'false');
  if (typeof album_auto_prune_missing === 'boolean') upsert('album_auto_prune_missing', album_auto_prune_missing ? 'true' : 'false');
  upsertInterval('album_auto_scan_interval_minutes', album_auto_scan_interval_minutes);
  if (typeof discogs_username === 'string') upsert('discogs_username', discogs_username);
  if (typeof discogs_token === 'string') upsert('discogs_token', discogs_token);
  if (typeof vinyl_auto_sync_enabled === 'boolean') upsert('vinyl_auto_sync_enabled', vinyl_auto_sync_enabled ? 'true' : 'false');
  upsertInterval('vinyl_auto_sync_interval_minutes', vinyl_auto_sync_interval_minutes);
  if (typeof lastfm_api_key === 'string') upsert('lastfm_api_key', lastfm_api_key);
  if (typeof games_auto_sync_enabled === 'boolean') upsert('games_auto_sync_enabled', games_auto_sync_enabled ? 'true' : 'false');
  upsertInterval('games_auto_sync_interval_minutes', games_auto_sync_interval_minutes);
  res.json({ ok: true });
});

module.exports = router;
