const db = require('../db');

// A custom picture for a "group by author/series" card — keyed by
// (media_type, group_key) rather than a real id, since an author/series
// isn't its own entity, just a text value several rows share. See
// db.js's group_images table comment and groupRename.js, which keeps
// these rows' keys in sync when a group is renamed or merged.

function getImageMap(mediaType) {
  const rows = db.prepare('SELECT group_key, cover_file FROM group_images WHERE media_type = ?').all(mediaType);
  return Object.fromEntries(
    rows.filter((r) => r.cover_file).map((r) => [r.group_key, `/posters/${r.cover_file}`])
  );
}

function getImage(mediaType, groupKey) {
  const row = db.prepare('SELECT cover_file FROM group_images WHERE media_type = ? AND group_key = ?').get(mediaType, groupKey);
  return row ? row.cover_file : null;
}

function setImage(mediaType, groupKey, coverFile) {
  db.prepare(
    `INSERT INTO group_images (media_type, group_key, cover_file) VALUES (?, ?, ?)
     ON CONFLICT(media_type, group_key) DO UPDATE SET cover_file = excluded.cover_file`
  ).run(mediaType, groupKey, coverFile);
}

function deleteImage(mediaType, groupKey) {
  db.prepare('DELETE FROM group_images WHERE media_type = ? AND group_key = ?').run(mediaType, groupKey);
}

// Called when one or more source groups are renamed/merged into
// targetKey (see groupRename.js). If the target doesn't already have its
// own picture, the first source picture found is adopted; otherwise the
// target's picture wins and the sources' are just dropped. Either way,
// every source row is cleared out afterward so a stale key never lingers.
function migrateKeys(mediaType, sourceKeys, targetKey) {
  if (!getImage(mediaType, targetKey)) {
    for (const key of sourceKeys) {
      const file = getImage(mediaType, key);
      if (file) {
        setImage(mediaType, targetKey, file);
        break;
      }
    }
  }
  for (const key of sourceKeys) {
    if (key !== targetKey) deleteImage(mediaType, key);
  }
}

// Used by each media type's "Clear Library" — returns every cover_file so
// the caller can unlink them from disk the same way it already does for
// the library's own item covers, then removes the now-orphaned rows.
function clearAll(mediaType) {
  const files = db.prepare('SELECT cover_file FROM group_images WHERE media_type = ? AND cover_file IS NOT NULL').all(mediaType).map((r) => r.cover_file);
  db.prepare('DELETE FROM group_images WHERE media_type = ?').run(mediaType);
  return files;
}

module.exports = { getImageMap, getImage, setImage, deleteImage, migrateKeys, clearAll };
