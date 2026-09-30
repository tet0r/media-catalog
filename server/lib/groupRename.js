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

// Comics' series, Games' platform, and Albums'/Vinyl's artist are all
// plain TEXT columns (one value per row, not a JSON list like audiobooks'
// authors), so renaming any of them is the same straight value swap —
// genuinely one function, just parameterized by which table/column.
function renameTextColumnGroup(table, column, mediaType, sourceNames, targetName) {
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const name of sourceNames) {
      updated += update.run(targetName, name).changes;
    }
    groupImages.migrateKeys(mediaType, sourceNames, targetName);
  });
  tx();
  return updated;
}

module.exports = { renameAuthorGroup, renameTextColumnGroup };
