const db = require('../db');
const groupImages = require('./groupImages');

// Renaming a single author is just merging a group of one into a new
// name, so both "rename" and "merge N groups" in the UI go through this
// same function — sourceNames is always an array, just length 1 for a
// plain rename.
//
// Audiobooks/Ebooks store `authors` as a JSON array; grouping only ever
// keys off authors[0] (the "primary"/credited author — see the client's
// primaryAuthor()), so that's the only position touched here. A co-author
// listed elsewhere on the same book is left alone, same as grouping
// itself ignores them.
function renameAuthorGroup(table, mediaType, sourceNames, targetName) {
  const rows = db.prepare(`SELECT id, authors FROM ${table} WHERE authors IS NOT NULL`).all();
  const update = db.prepare(`UPDATE ${table} SET authors = ? WHERE id = ?`);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      let authors;
      try {
        authors = JSON.parse(row.authors);
      } catch {
        continue;
      }
      if (!Array.isArray(authors) || authors.length === 0) continue;
      if (!sourceNames.includes(authors[0])) continue;
      authors[0] = targetName;
      update.run(JSON.stringify(authors), row.id);
      updated++;
    }
    groupImages.migrateKeys(mediaType, sourceNames, targetName);
  });
  tx();
  return updated;
}

// Comics' series is a plain TEXT column (one series per issue, not a
// JSON list), so this is a straight value swap rather than the JSON
// surgery renameAuthorGroup needs.
function renameSeriesGroup(sourceNames, targetName) {
  const update = db.prepare('UPDATE comics SET series = ? WHERE series = ?');
  let updated = 0;
  const tx = db.transaction(() => {
    for (const name of sourceNames) {
      updated += update.run(targetName, name).changes;
    }
    groupImages.migrateKeys('comic_series', sourceNames, targetName);
  });
  tx();
  return updated;
}

module.exports = { renameAuthorGroup, renameSeriesGroup };
