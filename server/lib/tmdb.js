const BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdb_api_key');
  return (row && row.value) || process.env.TMDB_API_KEY || '';
}

async function searchMovies(db, query, year) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('TMDB API key not configured. Add it in Settings.');
  const url = new URL(`${BASE}/search/movie`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  if (year) url.searchParams.set('primary_release_year', String(year));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function getMovieDetails(db, tmdbId) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('TMDB API key not configured. Add it in Settings.');
  const url = new URL(`${BASE}/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'credits');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB details failed: ${res.status}`);
  return res.json();
}

async function getMovieImages(db, tmdbId) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('TMDB API key not configured. Add it in Settings.');
  const url = new URL(`${BASE}/movie/${tmdbId}/images`);
  url.searchParams.set('api_key', apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB images failed: ${res.status}`);
  return res.json();
}

module.exports = { searchMovies, getMovieDetails, getMovieImages, getApiKey, IMG_BASE };
