const fs = require('fs');
const path = require('path');
const db = require('../db');
const launchbox = require('./launchboxLibrary');
const { cacheImageFromLocalFile } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LAUNCHBOX_DIR = process.env.LAUNCHBOX_DIR || '';

const getSyncStatus = db.prepare('SELECT * FROM games_sync_status WHERE id = 1');
const updateSyncStatus = db.prepare(`UPDATE games_sync_status SET running=@running, last_run=@last_run, total_found=@total_found,
  added=@added, updated=@updated, removed=@removed, errored=@errored, message=@message WHERE id = 1`);
const selectExisting = db.prepare('SELECT id, launchbox_id, cover_file, platform FROM games');
const deleteGame = db.prepare('DELETE FROM games WHERE id = ?');

// cover_file and platform ARE included in the UPDATE clause, unlike every
// other media type's metadata refresh — but the JS below only ever
// computes a *different* value for either when the existing one was
// empty, so an already-set cover (auto-fetched or manually uploaded) or a
// manually-renamed platform is written right back unchanged. This is what
// lets a routine sync backfill covers for games that had none the first
// time (e.g. before a cover-matching bug was fixed) without ever
// clobbering a deliberate pick — and, for platform, is what lets a
// renamed platform group (routes/games.js's /platforms/rename) survive
// future syncs instead of reverting to LaunchBox's own XML value.
const upsertGame = db.prepare(`INSERT INTO games
  (launchbox_id, database_id, title, platform, developer, publisher, genres, release_date, overview, rating, version, cover_file, file_path)
  VALUES (@launchbox_id,@database_id,@title,@platform,@developer,@publisher,@genres,@release_date,@overview,@rating,@version,@cover_file,@file_path)
  ON CONFLICT(launchbox_id) DO UPDATE SET
    database_id=excluded.database_id, title=excluded.title, platform=excluded.platform,
    developer=excluded.developer, publisher=excluded.publisher, genres=excluded.genres,
    release_date=excluded.release_date, overview=excluded.overview, rating=excluded.rating,
    version=excluded.version, file_path=excluded.file_path, cover_file=excluded.cover_file`);

function setStatus(fields) {
  const cur = getSyncStatus.get();
  const merged = { ...cur, ...fields };
  updateSyncStatus.run(merged);
}

// manual defaults to true so every existing direct call (routes/games.js's
// "Sync Now" button, and any other caller that doesn't know about this
// flag) keeps doing a full refresh exactly as before — only
// autoScanScheduler.js's own scheduled tick passes manual: false.
async function runSync({ manual = true } = {}) {
  if (!LAUNCHBOX_DIR) {
    setStatus({ running: 0, message: 'LAUNCHBOX_DIR not configured. Mount your LaunchBox folder and set it in docker-compose.yml.' });
    return;
  }
  if (!fs.existsSync(LAUNCHBOX_DIR)) {
    setStatus({ running: 0, message: `LAUNCHBOX_DIR (${LAUNCHBOX_DIR}) is not reachable. Check the network share/mount.` });
    return;
  }

  setStatus({ running: 1, message: 'Reading your LaunchBox library...', total_found: 0, added: 0, updated: 0, removed: 0, errored: 0 });
  try {
    const existingByLaunchboxId = new Map(selectExisting.all().map((r) => [r.launchbox_id, r]));
    const games = launchbox.listAllGames(LAUNCHBOX_DIR);

    let added = 0, updated = 0, errored = 0;
    const seenIds = new Set();

    for (const game of games) {
      seenIds.add(game.launchbox_id);
      const existing = existingByLaunchboxId.get(game.launchbox_id);
      const isNew = !existing;

      // Once a game's been found, its metadata is only ever touched by a
      // manual Sync click from here on — an automatic (scheduled) sync
      // still discovers new games and prunes removed ones below, it just
      // leaves every already-known game's row completely alone.
      if (!isNew && !manual) continue;

      try {
        let coverFile = existing?.cover_file || null;
        if (!coverFile && game.cover_path) {
          try {
            coverFile = cacheImageFromLocalFile(DATA_DIR, game.cover_path);
          } catch {
            coverFile = null;
          }
        }
        const result = upsertGame.run({
          launchbox_id: game.launchbox_id,
          database_id: game.database_id,
          title: game.title,
          // Same "already-set wins" rule as cover_file below — once a
          // platform has been renamed (see routes/games.js's
          // /platforms/rename), further syncs shouldn't silently revert
          // it back to whatever LaunchBox's own XML says.
          platform: existing?.platform || game.platform,
          developer: game.developer,
          publisher: game.publisher,
          genres: JSON.stringify(game.genres || []),
          release_date: game.release_date,
          overview: game.overview,
          rating: game.rating,
          version: game.version,
          cover_file: coverFile,
          file_path: game.file_path,
        });
        if (isNew) {
          added++;
          notifications.addNotification('game', result.lastInsertRowid, game.title);
        } else {
          updated++;
        }
      } catch {
        errored++;
      }
      setStatus({ added, updated, errored, total_found: games.length });
    }

    // Mirrors removals too — a game deleted from LaunchBox shouldn't
    // linger here forever.
    let removed = 0;
    for (const [launchboxId, row] of existingByLaunchboxId) {
      if (seenIds.has(launchboxId)) continue;
      if (row.cover_file) {
        try { fs.unlinkSync(path.join(DATA_DIR, 'posters', row.cover_file)); } catch { /* already gone, fine */ }
      }
      deleteGame.run(row.id);
      removed++;
    }

    setStatus({
      running: 0, last_run: new Date().toISOString(), total_found: games.length, added, updated, removed, errored,
      message: `Sync complete — ${added} added, ${updated} updated${removed ? `, ${removed} removed` : ''}${errored ? `, ${errored} failed` : ''}.`
        + (!manual ? ' (Automatic sync only adds/removes — click Sync Now to refresh existing games.)' : ''),
    });
  } catch (err) {
    setStatus({ running: 0, message: `Sync failed: ${err.message}` });
  }
}

module.exports = { runSync };
