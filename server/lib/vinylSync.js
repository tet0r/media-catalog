const fs = require('fs');
const path = require('path');
const db = require('../db');
const discogs = require('./discogs');
const { cacheImageFromUrl } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Prepared once at module load and reused, rather than re-prepared on every
// call — cheaper, and avoids repeatedly churning through short-lived
// Statement objects in the tight per-item sync loop below.
const getSyncStatus = db.prepare('SELECT * FROM vinyl_sync_status WHERE id = 1');
const updateSyncStatus = db.prepare(`UPDATE vinyl_sync_status SET running=@running, last_run=@last_run, total_found=@total_found,
  added=@added, updated=@updated, removed=@removed, errored=@errored, message=@message WHERE id = 1`);
const selectExisting = db.prepare('SELECT id, discogs_instance_id, cover_file FROM vinyl_records');
const deleteRecord = db.prepare('DELETE FROM vinyl_records WHERE id = ?');

// Deliberately leaves cover_file out of the UPDATE clause — same rationale
// as every other media type's metadata refresh: a manually-uploaded cover
// shouldn't be silently overwritten by a routine sync.
const upsertRecord = db.prepare(`INSERT INTO vinyl_records
  (discogs_instance_id, discogs_release_id, title, artist, year, genres, format, label, catalog_number, cover_file, date_added)
  VALUES (@discogs_instance_id,@discogs_release_id,@title,@artist,@year,@genres,@format,@label,@catalog_number,@cover_file,@date_added)
  ON CONFLICT(discogs_instance_id) DO UPDATE SET
    discogs_release_id=excluded.discogs_release_id, title=excluded.title, artist=excluded.artist,
    year=excluded.year, genres=excluded.genres, format=excluded.format, label=excluded.label,
    catalog_number=excluded.catalog_number, date_added=excluded.date_added`);

function setStatus(fields) {
  const cur = getSyncStatus.get();
  const merged = { ...cur, ...fields };
  updateSyncStatus.run(merged);
}

async function runSync() {
  const username = discogs.getUsername(db);
  const token = discogs.getApiKey(db);
  if (!username || !token) {
    setStatus({ running: 0, message: 'Discogs username/token not configured. Add them in Settings.' });
    return;
  }

  setStatus({ running: 1, message: 'Fetching your collection from Discogs...', total_found: 0, added: 0, updated: 0, removed: 0, errored: 0 });
  try {
    const existingByInstance = new Map(
      selectExisting.all().map((r) => [r.discogs_instance_id, r])
    );

    const items = await discogs.fetchCollection(username, token, {
      onPage: ({ page, totalPages, itemsSoFar }) => {
        setStatus({ message: `Fetching page ${page} of ${totalPages} (${itemsSoFar} so far)...` });
      },
    });

    // A cover-image fetch (a different host, i.discogs.com) starting
    // immediately after the Discogs API's own fetch resolves reproduces a
    // native crash in this environment (better-sqlite3/Node on Windows —
    // a connection-teardown timing issue, not an application-level bug).
    // A brief pause here reliably avoids it; harmless given the sync
    // already takes several seconds overall.
    await new Promise((resolve) => setTimeout(resolve, 500));

    let added = 0, updated = 0, errored = 0;
    const seenInstanceIds = new Set();

    for (const item of items) {
      seenInstanceIds.add(item.discogs_instance_id);
      const existing = existingByInstance.get(item.discogs_instance_id);
      const isNew = !existing;
      try {
        let coverFile = existing?.cover_file || null;
        if (isNew && item.cover_url) {
          try {
            coverFile = await cacheImageFromUrl(DATA_DIR, item.cover_url);
          } catch {
            coverFile = null;
          }
        }
        const result = upsertRecord.run({ ...item, cover_file: coverFile });
        if (isNew) {
          added++;
          notifications.addNotification('vinyl', result.lastInsertRowid, item.title);
        } else {
          updated++;
        }
      } catch {
        errored++;
      }
      setStatus({ added, updated, errored, total_found: items.length });
    }

    // Mirrors removals too — an item taken out of the Discogs collection
    // (sold, given away, ...) shouldn't linger here forever.
    let removed = 0;
    for (const [instanceId, row] of existingByInstance) {
      if (seenInstanceIds.has(instanceId)) continue;
      if (row.cover_file) {
        try { fs.unlinkSync(path.join(DATA_DIR, 'posters', row.cover_file)); } catch { /* already gone, fine */ }
      }
      deleteRecord.run(row.id);
      removed++;
    }

    setStatus({
      running: 0, last_run: new Date().toISOString(), total_found: items.length, added, updated, removed, errored,
      message: `Sync complete — ${added} added, ${updated} updated${removed ? `, ${removed} removed` : ''}${errored ? `, ${errored} failed` : ''}.`,
    });
  } catch (err) {
    setStatus({ running: 0, message: `Sync failed: ${err.message}` });
  }
}

module.exports = { runSync };
