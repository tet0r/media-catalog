// SteamGridDB (steamgriddb.com) — community-made cover art for games on
// every platform and store, not just Steam. Needs a free API key, from the
// "API" tab of your SteamGridDB profile preferences.
const BASE = 'https://www.steamgriddb.com/api/v2';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';
const MAX_GAMES = 3;
const MAX_RESULTS = 18;

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('steamgriddb_api_key');
  return (row && row.value) || process.env.STEAMGRIDDB_API_KEY || '';
}

async function api(apiKey, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT, Authorization: `Bearer ${apiKey}` } });
  if (res.status === 401 || res.status === 403) throw new Error('SteamGridDB rejected the API key. Check it in Settings (Games).');
  if (!res.ok) throw new Error(`SteamGridDB request failed: ${res.status}`);
  const body = await res.json();
  if (body.success === false) throw new Error(`SteamGridDB: ${(body.errors || []).join(', ') || 'request failed'}`);
  return body.data || [];
}

async function searchCovers(db, title) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('SteamGridDB API key not configured. Add it in Settings (Games).');
  if (!title) return [];

  const games = (await api(apiKey, `/search/autocomplete/${encodeURIComponent(title)}`)).slice(0, MAX_GAMES);
  // Portrait box-art-shaped grids only, still images only (no animated).
  const grids = await Promise.all(
    games.map((g) => api(apiKey, `/grids/game/${g.id}?dimensions=600x900,342x482,660x930&types=static`).then((rows) => rows.map((r) => ({ game: g, row: r }))))
  );
  return grids
    .flat()
    .slice(0, MAX_RESULTS)
    .map(({ game, row }) => ({ url: row.url, thumbnail_url: row.thumb || row.url, label: game.name }));
}

module.exports = { searchCovers, getApiKey };
