// A user's OWN vinyl collection, pulled straight from Discogs — unlike
// every other media type in this app, Vinyl isn't matched against a public
// catalog at all; it's a direct mirror of collection data the user already
// maintains on discogs.com itself. Needs a Discogs Personal Access Token
// (discogs.com → Settings → Developers → Generate new token), since the
// collection endpoint requires authenticating as that user.

const API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'media-catalog/1.0 (+https://github.com/tet0r/media-catalog)';

// Discogs' documented rate limit for authenticated requests is 60/minute —
// far more generous than MusicBrainz's 1/sec, and a sync only ever needs a
// handful of paginated requests (100 releases/page) even for a large
// collection. Still throttled for the same reason as musicbrainz.js: cheap
// insurance against ever tripping the limit, never worth skipping.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_token');
  return (row && row.value) || process.env.DISCOGS_TOKEN || '';
}

function getUsername(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_username');
  return (row && row.value) || process.env.DISCOGS_USERNAME || '';
}

async function discogsFetch(url, token) {
  await throttle();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Discogs rejected the token — check it in Settings.');
    if (res.status === 404) throw new Error('Discogs user not found — check the username in Settings.');
    throw new Error(`Discogs request failed: ${res.status}`);
  }
  return res.json();
}

// Discogs disambiguates same-named artists in its own database with a
// trailing "(2)"-style suffix (e.g. "Boston (2)" when more than one artist
// is named "Boston") — stripped here since it's a Discogs-internal detail,
// not part of the artist's actual name.
function cleanArtistName(name) {
  return (name || '').replace(/\s*\(\d+\)$/, '').trim();
}

function formatLabel(basic) {
  const formats = basic.formats || [];
  const parts = formats.map((f) => [f.name, ...(f.descriptions || [])].filter(Boolean).join(' '));
  return parts.join(', ') || null;
}

function toRecord(item) {
  const basic = item.basic_information || {};
  const label = (basic.labels || [])[0];
  return {
    discogs_instance_id: item.instance_id,
    discogs_release_id: basic.id,
    title: basic.title,
    artist: (basic.artists || []).map((a) => cleanArtistName(a.name)).join(', ') || null,
    year: basic.year || null,
    genres: JSON.stringify([...(basic.genres || []), ...(basic.styles || [])]),
    format: formatLabel(basic),
    label: label?.name || null,
    catalog_number: label?.catno || null,
    cover_url: basic.cover_image || null,
    date_added: item.date_added || null,
  };
}

// Folder 0 is Discogs' special "All" folder — it always contains the
// user's whole collection regardless of which custom folders they've
// sorted things into, so a sync never misses an item just because it's
// filed away in a folder other than the default one.
async function fetchCollection(username, token, { onPage } = {}) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(`${API_BASE}/users/${encodeURIComponent(username)}/collection/folders/0/releases`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');
    const data = await discogsFetch(url, token);
    totalPages = data.pagination?.pages || 1;
    const items = (data.releases || []).map(toRecord);
    all.push(...items);
    if (onPage) onPage({ page, totalPages, itemsSoFar: all.length });
    page++;
  } while (page <= totalPages);
  return all;
}

module.exports = { fetchCollection, getApiKey, getUsername };
