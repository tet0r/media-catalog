const path = require('path');
const db = require('../db');
const { cachePoster } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Called after every TMDB movie-details fetch (add/refresh/rematch) so a
// franchise collection appears automatically the moment you own a matching
// movie — using TMDB's own name/poster for it, no separate lookup needed.
// Membership itself isn't stored here: it's just "every movie whose
// tmdb_collection_id matches", computed in getMemberMovies.
async function syncFranchiseCollection(details) {
  const bc = details.belongs_to_collection;
  if (!bc) return;
  const existing = db.prepare('SELECT id FROM collections WHERE type = ? AND tmdb_collection_id = ?').get('franchise', bc.id);
  if (existing) return;
  const posterFile = await cachePoster(DATA_DIR, bc.poster_path);
  db.prepare('INSERT INTO collections (name, type, tmdb_collection_id, poster_file) VALUES (?, ?, ?, ?)')
    .run(bc.name, 'franchise', bc.id, posterFile);
}

// A franchise collection's membership is TMDB's automatic match plus
// whatever's been manually added on top via collection_movies (for a
// movie TMDB doesn't officially list in that collection but the user
// wants grouped there anyway) — the two are merged and deduped, since a
// movie could in principle end up in both sets. Each movie is tagged
// `removable`: false for an automatic TMDB match (there's nothing to
// remove — it stays until the movie's own tmdb_collection_id changes),
// true for a manual addition or for any movie in a manual collection
// (removing there is always meaningful, since that's its only membership
// rule) — the client uses this to decide whether to show a remove button
// at all, rather than showing one that would silently do nothing.
function getMemberMovies(collection) {
  if (collection.type === 'franchise') {
    const automatic = db.prepare('SELECT * FROM movies WHERE tmdb_collection_id = ?').all(collection.tmdb_collection_id);
    const manual = db.prepare(`
      SELECT movies.* FROM collection_movies
      JOIN movies ON movies.id = collection_movies.movie_id
      WHERE collection_movies.collection_id = ?
    `).all(collection.id);
    const automaticIds = new Set(automatic.map((m) => m.id));
    const byId = new Map();
    for (const m of automatic) byId.set(m.id, { ...m, removable: false });
    for (const m of manual) {
      if (!automaticIds.has(m.id)) byId.set(m.id, { ...m, removable: true });
    }
    return [...byId.values()].sort((a, b) => (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title));
  }
  return db
    .prepare(
      `SELECT movies.* FROM collection_movies
       JOIN movies ON movies.id = collection_movies.movie_id
       WHERE collection_movies.collection_id = ?
       ORDER BY movies.year, movies.title`
    )
    .all(collection.id)
    .map((m) => ({ ...m, removable: true }));
}

// A franchise collection only "counts" once 2+ movies actually belong to
// it — a single movie isn't really a collection, and franchise membership
// is automatic (the user never chose it the way they choose what goes in
// a manual collection), so a lone match shouldn't get surfaced as one.
// Manual collections are exempt: the user put that movie there on
// purpose, so it should show even alone.
function isSurfaced(collection) {
  return collection.type === 'manual' || getMemberMovies(collection).length > 1;
}

// Every movie's franchise/manual collection memberships, for showing
// "Part of: ..." on the movie's own detail page. Cheap for a personal
// library's scale (handful of collections at most). Deduped by id since a
// movie manually added to a franchise collection it's also automatically
// matched to would otherwise show up twice.
function getCollectionsForMovie(row) {
  const byId = new Map();
  if (row.tmdb_collection_id) {
    const franchise = db.prepare("SELECT * FROM collections WHERE type = 'franchise' AND tmdb_collection_id = ?").get(row.tmdb_collection_id);
    if (franchise && isSurfaced(franchise)) byId.set(franchise.id, { id: franchise.id, name: franchise.name });
  }
  const viaJunction = db.prepare(`
    SELECT collections.id, collections.name FROM collection_movies
    JOIN collections ON collections.id = collection_movies.collection_id
    WHERE collection_movies.movie_id = ?
  `).all(row.id);
  for (const c of viaJunction) byId.set(c.id, c);
  return [...byId.values()];
}

module.exports = { syncFranchiseCollection, getMemberMovies, getCollectionsForMovie, isSurfaced };
