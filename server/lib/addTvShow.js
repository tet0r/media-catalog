const path = require('path');
const db = require('../db');
const tvdb = require('./tvdb');
const { cacheImageFromUrl } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function extractContentRating(details) {
  const us = (details.contentRatings || []).find((r) => (r.country || '').toLowerCase() === 'usa');
  return us ? us.name : null;
}

function extractImdbId(details) {
  const imdb = (details.remoteIds || []).find((r) => (r.sourceName || '').toLowerCase() === 'imdb');
  return imdb ? imdb.id : null;
}

// Only actual performers, not writers/directors/etc. that TheTVDB also
// lists as "characters" for crew credits — peopleType tells them apart.
// Sorted by TheTVDB's own `sort` field (billing order) before capping, same
// idea as addMovie.js slicing TMDB's already-billing-ordered cast list.
// profile_url (not "profile_path" the way TMDB's movie cast has it) since
// TheTVDB's image fields are already-absolute URLs, unlike TMDB's, which
// need a base-URL prefix the client applies itself.
function extractCast(details) {
  return (details.characters || [])
    .filter((c) => (c.peopleType || '').toLowerCase() === 'actor')
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .slice(0, 12)
    .map((c) => ({ name: c.personName, character: c.name, profile_url: c.personImgURL || c.image || null }));
}

// Shared by both a fresh add and a metadata refresh of an existing show, so
// the two never drift out of sync with each other.
function extractMetadata(details) {
  return {
    title: details.name,
    year: details.year ? parseInt(details.year, 10) : null,
    overview: details.overview || null,
    first_aired: details.firstAired || null,
    last_aired: details.lastAired || null,
    status: details.status?.name || null,
    network: details.originalNetwork?.name || details.latestNetwork?.name || null,
    runtime: details.averageRuntime || null,
    genres: JSON.stringify((details.genres || []).map((g) => g.name)),
    cast: JSON.stringify(extractCast(details)),
    tvdb_score: details.score ?? null,
    imdb_id: extractImdbId(details),
    original_language: details.originalLanguage || null,
    production_companies: JSON.stringify((details.companies || []).map((c) => c.name)),
    content_rating: extractContentRating(details),
    slug: details.slug || null,
  };
}

const INSERT_SQL = `INSERT INTO tv_shows
  (tvdb_id, title, year, overview, first_aired, last_aired, status, network, runtime, genres, cast,
   poster_file, backdrop_file, tvdb_score, imdb_id, original_language, production_companies, content_rating,
   slug, file_path, format)
  VALUES (@tvdb_id,@title,@year,@overview,@first_aired,@last_aired,@status,@network,@runtime,@genres,@cast,
   @poster_file,@backdrop_file,@tvdb_score,@imdb_id,@original_language,@production_companies,@content_rating,
   @slug,@file_path,@format)`;

async function addTvShowFromTvdbId(tvdbId, { filePath = null, format = null } = {}) {
  const details = await tvdb.getSeriesDetails(db, tvdbId);
  const posterFile = details.image ? await cacheImageFromUrl(DATA_DIR, details.image).catch(() => null) : null;
  const backdropUrl = await tvdb.getBackdropUrl(db, details).catch(() => null);
  const backdropFile = backdropUrl ? await cacheImageFromUrl(DATA_DIR, backdropUrl).catch(() => null) : null;
  const meta = extractMetadata(details);

  const info = db.prepare(INSERT_SQL).run({
    ...meta,
    tvdb_id: details.id,
    poster_file: posterFile,
    backdrop_file: backdropFile,
    file_path: filePath,
    format: format || (filePath ? 'File' : 'Digital'),
  });
  const row = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(info.lastInsertRowid);
  notifications.addNotification('tv', row.id, row.title);
  return row;
}

// Re-fetches an existing show's TheTVDB details and updates its metadata in
// place. Deliberately leaves poster_file/backdrop_file untouched — same
// rationale as refreshMovieMetadata: don't silently overwrite a custom
// image pick with a routine metadata refresh.
async function refreshTvShowMetadata(showId, tvdbId) {
  const details = await tvdb.getSeriesDetails(db, tvdbId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE tv_shows SET ${setClause} WHERE id = @id`).run({ ...meta, id: showId });
  return db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(showId);
}

module.exports = { addTvShowFromTvdbId, refreshTvShowMetadata, extractMetadata };
