const express = require('express');
const db = require('../db');
const backupLib = require('../lib/backup');
const libraryPaths = require('../lib/libraryPaths');

const router = express.Router();

const DEFAULT_AUTO_SCAN_INTERVAL_MINUTES = 60;
const DEFAULT_BACKUP_INTERVAL_MINUTES = 1440; // daily
const DEFAULT_BACKUP_RETENTION_COUNT = 14;

// Every leaf media-type key the sidebar can show/hide independently —
// kept as one list so a future media type only needs adding here, not in
// both the GET and PUT handlers separately.
const SIDEBAR_SECTION_KEYS = ['movies', 'audiobooks', 'ebooks', 'comics', 'albums', 'vinyl', 'games', 'tv'];

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
    comicvine_api_key: map.comicvine_api_key || '',
    comicvine_api_key_source: map.comicvine_api_key ? 'settings' : (process.env.COMICVINE_API_KEY ? 'env' : 'none'),
    metron_username: map.metron_username || '',
    metron_password: map.metron_password || '',
    metron_source: map.metron_username && map.metron_password
      ? 'settings'
      : (process.env.METRON_USERNAME && process.env.METRON_PASSWORD ? 'env' : 'none'),
    comic_auto_scan_enabled: map.comic_auto_scan_enabled === 'true',
    comic_auto_scan_interval_minutes: Number(map.comic_auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    comic_auto_prune_missing: map.comic_auto_prune_missing === 'true',
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
    launchbox_dir_configured: !!libraryPaths.getLaunchboxDir(),
    launchbox_dir: libraryPaths.describeLaunchboxDir(),
    library_dirs: Object.fromEntries(
      Object.keys(libraryPaths.TYPES).map((type) => [type, libraryPaths.describeLibraryDirs(type)])
    ),
    // True when running as the packaged desktop app — the client uses it to
    // offer a native "Browse..." folder picker and to phrase folder help
    // for a local path instead of a container mount.
    desktop: libraryPaths.isDesktop(),
    // null (never chosen) rather than a default, so the client keeps whatever
    // it already shows — see client/src/theme.js's initTheme.
    ui_theme: ['system', 'light', 'dark'].includes(map.ui_theme) ? map.ui_theme : null,
    tvdb_api_key: map.tvdb_api_key || '',
    tvdb_api_key_source: map.tvdb_api_key ? 'settings' : (process.env.TVDB_API_KEY ? 'env' : 'none'),
    tvdb_pin: map.tvdb_pin || '',
    tv_auto_scan_enabled: map.tv_auto_scan_enabled === 'true',
    tv_auto_scan_interval_minutes: Number(map.tv_auto_scan_interval_minutes) || DEFAULT_AUTO_SCAN_INTERVAL_MINUTES,
    tv_auto_prune_missing: map.tv_auto_prune_missing === 'true',
    ...Object.fromEntries(
      SIDEBAR_SECTION_KEYS.map((key) => [`sidebar_hidden_${key}`, map[`sidebar_hidden_${key}`] === 'true'])
    ),
    backup_auto_enabled: map.backup_auto_enabled === 'true',
    backup_auto_interval_minutes: Number(map.backup_auto_interval_minutes) || DEFAULT_BACKUP_INTERVAL_MINUTES,
    backup_retention_count: Number(map.backup_retention_count) || DEFAULT_BACKUP_RETENTION_COUNT,
    backup_dir_configured: !!process.env.BACKUP_DIR,
    backup_dir: backupLib.BACKUP_DIR,
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
    comicvine_api_key, metron_username, metron_password,
    comic_auto_scan_enabled, comic_auto_scan_interval_minutes, comic_auto_prune_missing,
    album_auto_scan_enabled, album_auto_scan_interval_minutes, album_auto_prune_missing,
    discogs_username, discogs_token, vinyl_auto_sync_enabled, vinyl_auto_sync_interval_minutes,
    lastfm_api_key, games_auto_sync_enabled, games_auto_sync_interval_minutes,
    tvdb_api_key, tvdb_pin, tv_auto_scan_enabled, tv_auto_scan_interval_minutes, tv_auto_prune_missing,
    sidebar_hidden, backup_auto_enabled, backup_auto_interval_minutes, backup_retention_count,
    library_dirs, launchbox_dir, ui_theme,
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
  if (typeof comicvine_api_key === 'string') upsert('comicvine_api_key', comicvine_api_key);
  if (typeof metron_username === 'string') upsert('metron_username', metron_username);
  if (typeof metron_password === 'string') upsert('metron_password', metron_password);
  if (typeof comic_auto_scan_enabled === 'boolean') upsert('comic_auto_scan_enabled', comic_auto_scan_enabled ? 'true' : 'false');
  if (typeof comic_auto_prune_missing === 'boolean') upsert('comic_auto_prune_missing', comic_auto_prune_missing ? 'true' : 'false');
  upsertInterval('comic_auto_scan_interval_minutes', comic_auto_scan_interval_minutes);
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
  if (typeof tvdb_api_key === 'string') upsert('tvdb_api_key', tvdb_api_key);
  if (typeof tvdb_pin === 'string') upsert('tvdb_pin', tvdb_pin);
  if (typeof tv_auto_scan_enabled === 'boolean') upsert('tv_auto_scan_enabled', tv_auto_scan_enabled ? 'true' : 'false');
  if (typeof tv_auto_prune_missing === 'boolean') upsert('tv_auto_prune_missing', tv_auto_prune_missing ? 'true' : 'false');
  upsertInterval('tv_auto_scan_interval_minutes', tv_auto_scan_interval_minutes);
  if (sidebar_hidden && typeof sidebar_hidden === 'object') {
    for (const key of SIDEBAR_SECTION_KEYS) {
      if (key in sidebar_hidden) upsert(`sidebar_hidden_${key}`, sidebar_hidden[key] ? 'true' : 'false');
    }
  }
  if (typeof backup_auto_enabled === 'boolean') upsert('backup_auto_enabled', backup_auto_enabled ? 'true' : 'false');
  upsertInterval('backup_auto_interval_minutes', backup_auto_interval_minutes);
  if (backup_retention_count !== undefined && backup_retention_count !== null && backup_retention_count !== '') {
    const count = Number(backup_retention_count);
    if (Number.isFinite(count) && count > 0) upsert('backup_retention_count', String(Math.round(count)));
  }
  // Each type's folder list: an array replaces it, null reverts to the
  // environment/default (see lib/libraryPaths.js).
  if (library_dirs && typeof library_dirs === 'object') {
    for (const type of Object.keys(libraryPaths.TYPES)) {
      if (!(type in library_dirs)) continue;
      const value = library_dirs[type];
      if (value === null || Array.isArray(value)) libraryPaths.setLibraryDirs(type, value);
    }
  }
  if (launchbox_dir === null || typeof launchbox_dir === 'string') libraryPaths.setLaunchboxDir(launchbox_dir);
  if (['system', 'light', 'dark'].includes(ui_theme)) upsert('ui_theme', ui_theme);
  res.json({ ok: true });
});

module.exports = router;
