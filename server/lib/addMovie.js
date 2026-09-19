const path = require('path');
const db = require('../db');
const tmdb = require('./tmdb');
const { cachePoster } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Crew jobs worth surfacing beyond the director (which gets its own column).
// Capped and filtered rather than storing all of TMDB's often-huge crew
// list verbatim.
const NOTABLE_CREW_JOBS = new Set([
  'Screenplay', 'Writer', 'Story', 'Producer', 'Executive Producer',
  'Director of Photography', 'Original Music Composer', 'Editor',
]);

// US MPAA rating (G/PG/PG-13/R/NC-17/NR) from TMDB's release_dates data,
// which is keyed by country and then by release type (theatrical, digital,
// ...) — take the first US entry that actually has a certification set.
function extractContentRating(details) {
  const us = (details.release_dates?.results || []).find((r) => r.iso_3166_1 === 'US');
  if (!us) return null;
  const withCert = (us.release_dates || []).find((rd) => rd.certification);
  return withCert ? withCert.certification : null;
}

// Shared by both a fresh add and a metadata refresh of an existing movie,
// so the two never drift out of sync with each other.
function extractMetadata(details) {
  const director = (details.credits?.crew || []).find((c) => c.job === 'Director');
  const cast = (details.credits?.cast || []).slice(0, 12).map((c) => ({ name: c.name, character: c.character, profile_path: c.profile_path || null }));
  const crew = (details.credits?.crew || [])
    .filter((c) => NOTABLE_CREW_JOBS.has(c.job))
    .slice(0, 8)
    .map((c) => ({ name: c.name, job: c.job }));

  return {
    title: details.title,
    original_title: details.original_title,
    year: details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null,
    overview: details.overview,
    tagline: details.tagline || null,
    runtime: details.runtime,
    genres: JSON.stringify((details.genres || []).map((g) => g.name)),
    director: director ? director.name : null,
    cast: JSON.stringify(cast),
    crew: JSON.stringify(crew),
    tmdb_rating: details.vote_average,
    vote_count: details.vote_count || null,
    imdb_id: details.imdb_id || null,
    budget: details.budget || null,
    revenue: details.revenue || null,
    status: details.status || null,
    original_language: details.original_language || null,
    homepage: details.homepage || null,
    production_companies: JSON.stringify((details.production_companies || []).map((c) => c.name)),
    spoken_languages: JSON.stringify((details.spoken_languages || []).map((l) => l.english_name || l.name)),
    content_rating: extractContentRating(details),
  };
}

const INSERT_SQL = `INSERT INTO movies
  (tmdb_id, title, original_title, year, overview, tagline, runtime, genres, director, cast, crew,
   poster_file, backdrop_file, tmdb_rating, vote_count, imdb_id, budget, revenue, status,
   original_language, homepage, production_companies, spoken_languages, content_rating, file_path, format)
  VALUES (@tmdb_id,@title,@original_title,@year,@overview,@tagline,@runtime,@genres,@director,@cast,@crew,
   @poster_file,@backdrop_file,@tmdb_rating,@vote_count,@imdb_id,@budget,@revenue,@status,
   @original_language,@homepage,@production_companies,@spoken_languages,@content_rating,@file_path,@format)`;

async function addMovieFromTmdbId(tmdbId, { filePath = null, format = null } = {}) {
  const details = await tmdb.getMovieDetails(db, tmdbId);
  const posterFile = await cachePoster(DATA_DIR, details.poster_path);
  const backdropFile = await cachePoster(DATA_DIR, details.backdrop_path);
  const meta = extractMetadata(details);

  const info = db.prepare(INSERT_SQL).run({
    ...meta,
    tmdb_id: details.id,
    poster_file: posterFile,
    backdrop_file: backdropFile,
    file_path: filePath,
    format: format || (filePath ? 'File' : 'Digital'),
  });
  return db.prepare('SELECT * FROM movies WHERE id = ?').get(info.lastInsertRowid);
}

// Re-fetches an existing movie's TMDB details and updates its metadata in
// place. Deliberately leaves poster_file/backdrop_file untouched — the user
// may have picked a custom image via ThePosterDB/TMDB gallery, and a
// metadata refresh shouldn't silently overwrite that choice.
async function refreshMovieMetadata(movieId, tmdbId) {
  const details = await tmdb.getMovieDetails(db, tmdbId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE movies SET ${setClause} WHERE id = @id`).run({ ...meta, id: movieId });
  return db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId);
}

module.exports = { addMovieFromTmdbId, refreshMovieMetadata };
