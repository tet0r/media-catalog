const db = require('../db');
const tmdb = require('./tmdb');
const { getMemberMovies } = require('./collections');

// "What else should be in this collection?" — answered from TMDB's own
// franchise collections, the same source franchise collections are built
// from:
//   - a franchise collection is about its own TMDB collection;
//   - a hand-made one is about the TMDB collection(s) its movies already
//     belong to, or — when none do yet — the best TMDB match for its name.
// Every movie TMDB lists in those collections is then sorted into:
//   in_library      owned, but not in this collection yet (can be added now)
//   not_in_library  listed by TMDB, not owned
// Movies already in the collection, and ones the user skipped, are left out.

const MAX_SOURCES = 10;

// Titles are compared with everything but letters/digits removed, so
// "Spider-Man: Homecoming" and "Spider Man Homecoming" are the same title.
const titleKey = (title) => String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) || null : null);

// Words that only describe "this is a set of movies" — dropped before
// deciding whether a TMDB collection's name is really about the same thing
// as a hand-made collection's name.
const FILLER = /\b(collection|saga|franchise|series|trilogy|anthology|films?|movies?)\b/g;
const nameKey = (name) => String(name || '').toLowerCase().replace(FILLER, ' ').replace(/[^a-z0-9]/g, '');

async function findSources(collection, members) {
  if (collection.type === 'franchise') {
    return collection.tmdb_collection_id ? [{ id: collection.tmdb_collection_id }] : [];
  }
  const ids = [...new Set(members.map((m) => m.tmdb_collection_id).filter(Boolean))];
  if (ids.length) return ids.slice(0, MAX_SOURCES).map((id) => ({ id }));

  const hit = await tmdb.findCollectionByName(db, collection.name);
  if (!hit) return [];
  // Only trust a name match that's close to what the user called it — an
  // unrelated top search result would suggest a pile of wrong movies.
  const ours = nameKey(collection.name);
  const theirs = nameKey(hit.name);
  if (!ours || !theirs || !(ours.includes(theirs) || theirs.includes(ours))) return [];
  return [{ id: hit.id }];
}

async function getSuggestions(collection) {
  const members = getMemberMovies(collection);
  const memberIds = new Set(members.map((m) => m.id));
  const skipped = new Set(
    db.prepare('SELECT tmdb_id FROM collection_suggestion_skips WHERE collection_id = ?').all(collection.id).map((r) => r.tmdb_id)
  );

  const sources = await findSources(collection, members);
  const parts = new Map();
  const sourceNames = [];
  for (const source of sources) {
    const details = await tmdb.getCollectionDetails(db, source.id);
    sourceNames.push(details.name);
    for (const part of details.parts || []) if (!parts.has(part.id)) parts.set(part.id, part);
  }

  const library = db.prepare('SELECT id, title, year, tmdb_id, poster_file FROM movies').all();
  const byTmdbId = new Map(library.filter((m) => m.tmdb_id).map((m) => [m.tmdb_id, m]));
  // For library movies matched by hand rather than to TMDB, fall back to
  // title + year.
  const byTitleYear = new Map(library.map((m) => [`${titleKey(m.title)}|${m.year || ''}`, m]));

  const inLibrary = [];
  const notInLibrary = [];
  let skippedCount = 0;

  for (const part of parts.values()) {
    const year = yearOf(part.release_date);
    const owned = byTmdbId.get(part.id) || byTitleYear.get(`${titleKey(part.title)}|${year || ''}`);
    if (owned && memberIds.has(owned.id)) continue;
    if (skipped.has(part.id)) {
      skippedCount++;
      continue;
    }
    if (owned) {
      inLibrary.push({
        tmdb_id: part.id,
        movie_id: owned.id,
        title: owned.title,
        year: owned.year || year,
        poster_url: owned.poster_file ? `/posters/${owned.poster_file}` : null,
      });
    } else {
      notInLibrary.push({
        tmdb_id: part.id,
        title: part.title,
        year,
        poster_url: part.poster_path ? `${tmdb.IMG_BASE}/w185${part.poster_path}` : null,
      });
    }
  }

  const byYear = (a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title);
  inLibrary.sort(byYear);
  notInLibrary.sort(byYear);
  return { sources: sourceNames, in_library: inLibrary, not_in_library: notInLibrary, skipped_count: skippedCount };
}

module.exports = { getSuggestions };
