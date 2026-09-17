const path = require('path');
const db = require('../db');
const tmdb = require('./tmdb');
const { cachePoster } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const INSERT_SQL = `INSERT INTO movies
  (tmdb_id, title, original_title, year, overview, runtime, genres, director, cast, poster_file, backdrop_file, tmdb_rating, file_path, format)
  VALUES (@tmdb_id,@title,@original_title,@year,@overview,@runtime,@genres,@director,@cast,@poster_file,@backdrop_file,@tmdb_rating,@file_path,@format)`;

async function addMovieFromTmdbId(tmdbId, { filePath = null, format = null } = {}) {
  const details = await tmdb.getMovieDetails(db, tmdbId);
  const posterFile = await cachePoster(DATA_DIR, details.poster_path);
  const backdropFile = await cachePoster(DATA_DIR, details.backdrop_path);
  const director = (details.credits?.crew || []).find((c) => c.job === 'Director');
  const castList = (details.credits?.cast || []).slice(0, 10).map((c) => ({ name: c.name, character: c.character }));

  const info = db.prepare(INSERT_SQL).run({
    tmdb_id: details.id,
    title: details.title,
    original_title: details.original_title,
    year: details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null,
    overview: details.overview,
    runtime: details.runtime,
    genres: JSON.stringify((details.genres || []).map((g) => g.name)),
    director: director ? director.name : null,
    cast: JSON.stringify(castList),
    poster_file: posterFile,
    backdrop_file: backdropFile,
    tmdb_rating: details.vote_average,
    file_path: filePath,
    format: format || (filePath ? 'File' : 'Digital'),
  });
  return db.prepare('SELECT * FROM movies WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { addMovieFromTmdbId };
