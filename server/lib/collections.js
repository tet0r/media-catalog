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

function getMemberMovies(collection) {
  if (collection.type === 'franchise') {
    return db.prepare('SELECT * FROM movies WHERE tmdb_collection_id = ? ORDER BY year, title').all(collection.tmdb_collection_id);
  }
  return db.prepare(`
    SELECT movies.* FROM collection_movies
    JOIN movies ON movies.id = collection_movies.movie_id
    WHERE collection_movies.collection_id = ?
    ORDER BY movies.year, movies.title
  `).all(collection.id);
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
// library's scale (handful of collections at most).
function getCollectionsForMovie(row) {
  const result = [];
  if (row.tmdb_collection_id) {
    const franchise = db.prepare("SELECT * FROM collections WHERE type = 'franchise' AND tmdb_collection_id = ?").get(row.tmdb_collection_id);
    if (franchise && isSurfaced(franchise)) result.push({ id: franchise.id, name: franchise.name });
  }
  const manual = db.prepare(`
    SELECT collections.id, collections.name FROM collection_movies
    JOIN collections ON collections.id = collection_movies.collection_id
    WHERE collection_movies.movie_id = ?
  `).all(row.id);
  result.push(...manual);
  return result;
}

module.exports = { syncFranchiseCollection, getMemberMovies, getCollectionsForMovie, isSurfaced };
