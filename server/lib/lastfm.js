// Album metadata via Last.fm's official API — free, but requires a
// registered API key (last.fm/api/account/create), same "settings or env
// var" pattern as TMDB (see getApiKey below).
//
// A search result doesn't reliably carry a MusicBrainz ID (album.search's
// own docs don't even list one on the result shape), so a candidate's key
// here is always the artist+album name pair itself, JSON-encoded —
// album.getInfo resolves just as well by name as by mbid, so there's no
// need for a separate mbid-vs-name code path depending on what a given
// search happened to return.

const API_BASE = 'http://ws.audioscrobbler.com/2.0/';

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastfm_api_key');
  return (row && row.value) || process.env.LASTFM_API_KEY || '';
}

function keyFor(artist, album) {
  return JSON.stringify({ artist, album });
}

function parseKey(key) {
  try {
    const { artist, album } = JSON.parse(key);
    if (!artist || !album) throw new Error('missing artist/album');
    return { artist, album };
  } catch {
    throw new Error('Invalid Last.fm album key');
  }
}

// Last.fm lists image sizes small→mega in a fixed order but individual
// entries are often blank placeholders (empty "#text") — take the largest
// one that actually has a URL.
function bestImage(images) {
  if (!images) return null;
  const list = Array.isArray(images) ? images : [images];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.['#text']) return list[i]['#text'];
  }
  return null;
}

// Last.fm's JSON serializer collapses a single-element list into a bare
// object instead of a one-item array (a well-documented quirk of this
// API) — every nested list here (tracks, tags) needs this same guard.
function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function yearFromReleaseDate(str) {
  const m = (str || '').match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

async function lastfmFetch(apiKey, params) {
  if (!apiKey) throw new Error('Last.fm API key not configured. Add it in Settings.');
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm error: ${data.message || 'unknown error'}`);
  return data;
}

async function searchAlbums(db, query) {
  if (!query) return [];
  const apiKey = getApiKey(db);
  const data = await lastfmFetch(apiKey, { method: 'album.search', album: query, limit: 15 });
  const matches = asArray(data.results?.albummatches?.album);
  return matches
    .filter((m) => m.artist && m.name)
    .map((m) => ({
      key: keyFor(m.artist, m.name),
      title: m.name,
      artist: m.artist,
      year: null, // album.search doesn't return a release year, only album.getInfo does
      cover_url: bestImage(m.image),
    }));
}

// Full detail for one album by its artist+album key — used both for Add/
// resolving a Needs Review item and for a metadata refresh.
async function getAlbumDetails(db, key) {
  const { artist, album } = parseKey(key);
  const apiKey = getApiKey(db);
  const data = await lastfmFetch(apiKey, { method: 'album.getinfo', artist, album });
  const info = data.album;
  if (!info) throw new Error(`No Last.fm album found for "${album}" by ${artist}`);

  const tracks = asArray(info.tracks?.track).map((t) => ({
    title: t.name,
    length_ms: t.duration ? Number(t.duration) * 1000 : null,
  }));
  const genres = asArray(info.toptags?.tag).map((t) => t.name).slice(0, 8);

  return {
    key,
    title: info.name,
    artist: info.artist,
    year: yearFromReleaseDate(info.releasedate),
    genres,
    tracks,
    cover_url: bestImage(info.image),
  };
}

module.exports = { searchAlbums, getAlbumDetails, keyFor, getApiKey };
