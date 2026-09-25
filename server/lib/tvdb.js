// TheTVDB's v4 API, unlike TMDB's, needs a short login exchange rather than
// a bare API key on every request: POST /login with your key (and a
// subscriber PIN, only if your key is the user-subscription-funded kind)
// returns a bearer token valid for about a month. This module logs in
// lazily on first use, caches the token in memory for the process's
// lifetime, and re-logs-in once if a request ever comes back 401 (covers
// both an expired token and the first call after a key/pin change in
// Settings). Free for personal/non-commercial use with attribution — see
// thetvdb.com/api-information; get a key from your account's Dashboard ->
// API Keys after creating a free thetvdb.com account.
const BASE = 'https://api4.thetvdb.com/v4';

const MIN_INTERVAL_MS = 300;
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tvdb_api_key');
  return (row && row.value) || process.env.TVDB_API_KEY || '';
}

function getPin(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tvdb_pin');
  return (row && row.value) || process.env.TVDB_PIN || '';
}

let cachedToken = null;
let cachedForKey = null;

async function login(db) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('TheTVDB API key not configured. Add it in Settings.');
  const pin = getPin(db);
  await throttle();
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin ? { apikey: apiKey, pin } : { apikey: apiKey }),
  });
  if (!res.ok) throw new Error(`TheTVDB login failed: ${res.status}`);
  const data = await res.json();
  const token = data?.data?.token;
  if (!token) throw new Error('TheTVDB login response had no token');
  cachedToken = token;
  cachedForKey = apiKey;
  return token;
}

// Re-logs-in if the key was changed in Settings since the cached token was
// issued (cachedForKey mismatch), not just on a bare cache miss.
async function getToken(db) {
  const apiKey = getApiKey(db);
  if (cachedToken && cachedForKey === apiKey) return cachedToken;
  return login(db);
}

async function tvdbFetch(db, path, params = {}) {
  const token = await getToken(db);
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  await throttle();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // Token expired (or key/pin changed) — one retry with a fresh login.
    const fresh = await login(db);
    await throttle();
    res = await fetch(url, { headers: { Authorization: `Bearer ${fresh}` } });
  }
  if (!res.ok) throw new Error(`TheTVDB request failed: ${res.status}`);
  const data = await res.json();
  return data.data;
}

// TheTVDB's "name"/"overview" are the show's PRIMARY-language text, which
// for anime and other non-English-native shows is the native title (e.g.
// Naruto search results come back as "NARUTO－ナルト－") — not what anyone
// scanning an English-named folder or searching by an English title wants.
// A search result already carries every language's title/overview inline
// (`translations`/`overviews`, language code -> text), so preferring the
// English one here is free — no extra request — and every caller (search
// results, the scan's exact-match against a folder name, Add Show) gets it
// automatically.
function preferEnglish(result) {
  return {
    ...result,
    name: result.translations?.eng || result.name,
    overview: result.overviews?.eng || result.overview,
  };
}

async function searchSeries(db, query, year) {
  const results = await tvdbFetch(db, '/search', { query, type: 'series', year });
  return (results || []).map(preferEnglish);
}

// Unlike search results, the extended series record does NOT inline other
// languages' text — only which languages HAVE a translation available
// (nameTranslations/overviewTranslations, just language codes). Getting the
// actual English text needs a second, dedicated call, made only when 'eng'
// is actually listed there (skips the extra request for a show with no
// English translation at all, rather than requesting and getting nothing).
async function getSeriesDetails(db, tvdbId) {
  const details = await tvdbFetch(db, `/series/${tvdbId}/extended`);
  if ((details.nameTranslations || []).includes('eng')) {
    try {
      const translation = await tvdbFetch(db, `/series/${tvdbId}/translations/eng`);
      if (translation) {
        details.name = translation.name || details.name;
        details.overview = translation.overview || details.overview;
      }
    } catch {
      // Listed as available but the fetch failed for some reason —
      // harmless to just keep the native name/overview.
    }
  }
  return details;
}

async function getSeriesBySlug(db, slug) {
  return tvdbFetch(db, `/series/slug/${slug}`);
}

// Search results already carry a resolvable poster (image_url), so this is
// only needed to find a backdrop/fanart-equivalent — TheTVDB doesn't
// surface that on the base/search record the way it does the poster.
// recordType 'series' + a name of "Background" is TheTVDB's own artwork
// type for it; discovered from the live API (cached) rather than a
// hardcoded numeric id, since those ids are internal and undocumented.
let cachedArtworkTypes = null;
async function getArtworkTypes(db) {
  if (cachedArtworkTypes) return cachedArtworkTypes;
  cachedArtworkTypes = await tvdbFetch(db, '/artwork/types');
  return cachedArtworkTypes;
}

async function findSeriesArtworkTypeId(db, nameRe) {
  const types = await getArtworkTypes(db);
  const match = (types || []).find((t) => t.recordType === 'series' && nameRe.test(t.name || ''));
  return match ? match.id : -1;
}

async function getBackdropUrl(db, details) {
  const typeId = await findSeriesArtworkTypeId(db, /background/i);
  if (typeId === -1) return null;
  const match = (details.artworks || []).find((a) => a.type === typeId);
  return match ? match.image : null;
}

// Every poster-type artwork for this series, for a "choose a different
// poster" picker — not just the single best one already on the base record.
async function getPosterOptions(db, details) {
  const typeId = await findSeriesArtworkTypeId(db, /^poster$/i);
  if (typeId === -1) return [];
  return (details.artworks || [])
    .filter((a) => a.type === typeId)
    .map((a) => ({ url: a.image, thumbnail_url: a.thumbnail || a.image }));
}

// Resolves an IMDb id (e.g. "tt0083399") to a TVDB series id via TheTVDB's
// own remote-id search — imdb.com has no public API of its own to hit
// directly, same rationale as tmdb.js's findByImdbId.
async function findSeriesByImdbId(db, imdbId) {
  const results = await tvdbFetch(db, `/search/remoteid/${imdbId}`);
  const match = (results || []).find((r) => r.series);
  return match ? match.series : null;
}

module.exports = {
  searchSeries, getSeriesDetails, getSeriesBySlug, getBackdropUrl, getPosterOptions,
  findSeriesByImdbId, getApiKey, getPin,
};
