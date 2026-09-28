// Comic metadata via the Metron API (https://metron.cloud) — a second
// catalog alongside ComicVine and GCD, so a rate limit or a missing match
// on one source doesn't stall the whole search (see comicSources.js, which
// orchestrates trying all three). Needs a free Metron account (username +
// password, HTTP Basic Auth) — metron.cloud/accounts/signup.
//
// Same two-hop model as ComicVine: search /series/ by name, then look up
// that series' specific issue via /issue/?series=<id>&number=<n>.

const BASE = 'https://metron.cloud/api';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';

function getCredentials(db) {
  const userRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('metron_username');
  const passRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('metron_password');
  const username = (userRow && userRow.value) || process.env.METRON_USERNAME || '';
  const password = (passRow && passRow.value) || process.env.METRON_PASSWORD || '';
  return { username, password };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Metron's documented limit is a 5000/day quota (HTTP 429 + Retry-After
// when exceeded), not ComicVine's tight per-second velocity limiter — a
// lighter pace than comicvine.js's is enough, just cheap insurance.
const MIN_REQUEST_INTERVAL_MS = 300;
let lastRequestAt = 0;

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_FALLBACK_MS = 3000;

async function apiGet(db, path, params) {
  const { username, password } = getCredentials(db);
  if (!username || !password) throw new Error('Metron account not configured. Add your username/password in Settings.');
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  for (let attempt = 0; ; attempt++) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Authorization: `Basic ${auth}` } });
    if (res.status === 429) {
      if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new Error('Metron rate limit exceeded — try again later.');
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_FALLBACK_MS);
      continue;
    }
    if (res.status === 401) throw new Error('Metron rejected the username/password — check it in Settings.');
    if (!res.ok) throw new Error(`Metron request failed: ${res.status}`);
    return res.json();
  }
}

function stripHtml(html) {
  if (!html) return null;
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

// Credit objects are {creator, role: [{name}, ...]} — role names come back
// as a list of {name} objects rather than a comma string like ComicVine's.
function parseCreators(credits) {
  return (credits || []).map((c) => ({
    name: c.creator,
    roles: (c.role || []).map((r) => (typeof r === 'string' ? r : r.name)).filter(Boolean),
  }));
}

// Series matching a name — the first hop.
async function searchVolumes(db, query, limit = 8) {
  if (!query) return [];
  const data = await apiGet(db, '/series/', { name: query, page_size: limit });
  return (data.results || []).map((s) => ({
    id: s.id,
    name: s.display_name || s.name,
    start_year: s.year_began || null,
    publisher: s.publisher ? s.publisher.name : null,
    issue_count: s.issue_count || 0,
  }));
}

// A specific issue within a series — the second hop. Returns null (not a
// throw) when that series simply doesn't have this issue number.
async function findIssueInSeries(db, seriesId, issueNumber) {
  const data = await apiGet(db, '/issue/', { series: seriesId, number: issueNumber });
  return (data.results || [])[0] || null;
}

// Flattened two-hop lookup, same shape/purpose as comicvine.js's
// searchIssues — every hit is tagged with its source so a caller mixing
// results from multiple catalogs (comicSources.js) can tell them apart.
async function searchIssues(db, seriesQuery, issueNumber, { maxVolumes = 5, maxHits = 8 } = {}) {
  if (!seriesQuery || !issueNumber) return [];
  const volumes = await searchVolumes(db, seriesQuery, maxVolumes);
  const hits = [];
  for (const volume of volumes) {
    if (hits.length >= maxHits) break;
    const issue = await findIssueInSeries(db, volume.id, issueNumber);
    if (!issue) continue;
    hits.push({
      id: issue.id,
      series: volume.name,
      issue_number: issue.number,
      title: issue.issue_name || `${volume.name} #${issue.number}`,
      cover_date: issue.cover_date || null,
      year: issue.cover_date ? Number(String(issue.cover_date).slice(0, 4)) : null,
      cover_url: issue.image || null,
      publisher: volume.publisher,
      source: 'metron',
    });
  }
  return hits;
}

// Full detail for one issue by id — used for actually adding/rematching
// and for a metadata refresh.
async function getIssueDetails(db, issueId) {
  const issue = await apiGet(db, `/issue/${issueId}/`);
  return {
    id: issue.id,
    series: issue.series ? issue.series.name : null,
    issue_number: issue.number,
    // Issues are very often untitled — same "Series #N" fallback as
    // ComicVine/GCD so every comic still gets a real, non-empty title.
    title: issue.collection_title || issue.issue_name || `${issue.series ? issue.series.name : 'Unknown'} #${issue.number}`,
    description: stripHtml(issue.desc),
    publisher: issue.publisher ? issue.publisher.name : null,
    cover_date: issue.cover_date || null,
    year: issue.cover_date ? Number(String(issue.cover_date).slice(0, 4)) : null,
    cover_url: issue.image || null,
    creators: parseCreators(issue.credits),
  };
}

module.exports = { getCredentials, searchVolumes, findIssueInSeries, searchIssues, getIssueDetails };
