// Comic metadata via the ComicVine API (https://comicvine.gamespot.com/api/)
// — free API key, but ComicVine rejects any request with no distinct
// User-Agent header (403), so every call sets one explicitly.
//
// There's no single call that finds "Series Name #5" directly: you search
// /volumes/ by series name, then look up that volume's specific issue via
// /issues/?filter=volume:<id>,issue_number:<n>. searchIssues() below does
// both hops and returns flat issue-level candidates, so every caller
// (manual search, scan auto-matching, Search Again) just deals with
// issues, never volumes.

const BASE = 'https://comicvine.gamespot.com/api';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';

function getApiKey(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('comicvine_api_key');
  return (row && row.value) || process.env.COMICVINE_API_KEY || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ComicVine enforces a velocity limit (HTTP 420, "Rate limit exceeded. Slow
// down cowboy.") on top of its hourly quota — this trips easily on a burst
// of back-to-back calls, which searchIssues() below naturally produces
// (one volume search plus one issue lookup per candidate volume, with
// nothing pacing those internal hops). Since every request funnels through
// this one function, pacing it here protects every caller — manual
// search's up-to-9-request burst included — without needing per-call-site
// delays. 1.1s matches the spacing other ComicVine API clients settled on
// to reliably avoid 420s.
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

// A 420 is ComicVine saying "you're going too fast", not "this request is
// wrong" — worth a short wait-and-retry rather than failing the whole
// search over it. Retry-After (seconds) is honored when present.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_FALLBACK_MS = 3000;

async function apiGet(db, path, params) {
  const apiKey = getApiKey(db);
  if (!apiKey) throw new Error('ComicVine API key not configured. Add it in Settings.');
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  for (let attempt = 0; ; attempt++) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 420) {
      if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new Error('ComicVine rate limit exceeded — try again in a minute.');
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_FALLBACK_MS);
      continue;
    }
    if (!res.ok) throw new Error(`ComicVine request failed: ${res.status}`);
    const data = await res.json();
    if (data.status_code !== 1) throw new Error(`ComicVine error: ${data.error || `status ${data.status_code}`}`);
    return data;
  }
}

// ComicVine descriptions are HTML — every other source's description
// field in this app is already plain text, so this is the one place that
// needs stripping.
function stripHtml(html) {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

// person_credits is a flat list of {name, role}, where role is a
// comma-separated string ("writer, artist") rather than the array shape
// most other fields here use.
function parseCreators(credits) {
  return (credits || []).map((c) => ({
    name: c.name,
    roles: (c.role || '').split(',').map((r) => r.trim()).filter(Boolean),
  }));
}

// Volumes (series) matching a name — the first hop. Uses /search/ rather
// than /volumes/?filter=name: — that filter is a case-sensitive substring
// match against ComicVine's stored name (confirmed via ComicVine's own API
// forums), so a filename-derived series name that differs in casing or
// punctuation from the canonical title returns zero results even when the
// series obviously exists. /search/ is relevance-based instead. Sorted by
// issue count descending (search doesn't support server-side sort) so an
// established series outranks an obscure same-named one-off.
async function searchVolumes(db, query, limit = 8) {
  if (!query) return [];
  const data = await apiGet(db, '/search/', {
    query,
    resources: 'volume',
    limit,
    field_list: 'id,name,start_year,publisher,image,count_of_issues',
  });
  return (data.results || [])
    .map((v) => ({
      id: v.id,
      name: v.name,
      start_year: v.start_year ? Number(v.start_year) : null,
      publisher: v.publisher ? v.publisher.name : null,
      image_url: v.image ? v.image.medium_url || v.image.small_url : null,
      issue_count: v.count_of_issues || 0,
    }))
    .sort((a, b) => b.issue_count - a.issue_count);
}

// A specific issue within a volume — the second hop. Returns null (not a
// throw) if that volume simply doesn't have this issue number, which is
// the normal, expected outcome while checking several volume candidates.
async function findIssueInVolume(db, volumeId, issueNumber) {
  const data = await apiGet(db, '/issues/', {
    filter: `volume:${volumeId},issue_number:${issueNumber}`,
    limit: 1,
    field_list: 'id,name,issue_number,cover_date,image,volume',
  });
  return (data.results || [])[0] || null;
}

// The two-hop lookup flattened into one "find this issue" call. Used by
// manual search (a generous maxVolumes) and scan auto-matching (a small
// one, to keep a big scan's ComicVine call count from growing unboundedly
// against the hourly rate limit — each candidate volume costs one extra
// request here).
async function searchIssues(db, seriesQuery, issueNumber, { maxVolumes = 5, maxHits = 8 } = {}) {
  if (!seriesQuery || !issueNumber) return [];
  const volumes = await searchVolumes(db, seriesQuery, maxVolumes);
  const hits = [];
  for (const volume of volumes) {
    if (hits.length >= maxHits) break;
    const issue = await findIssueInVolume(db, volume.id, issueNumber);
    if (!issue) continue;
    hits.push({
      id: issue.id,
      series: volume.name,
      issue_number: issue.issue_number,
      title: issue.name || `${volume.name} #${issue.issue_number}`,
      cover_date: issue.cover_date || null,
      year: issue.cover_date ? Number(issue.cover_date.slice(0, 4)) : null,
      cover_url: issue.image ? issue.image.medium_url || issue.image.small_url : null,
      publisher: volume.publisher,
      source: 'comicvine',
    });
  }
  return hits;
}

// Publisher for one volume by id — issue detail responses only carry a
// lightweight {id, name} volume reference, not its publisher, so getting
// that means a second call. Volume ids need the "4050-" resource-type
// prefix in the detail URL (issues use "4000-").
async function getVolumePublisher(db, volumeId) {
  if (!volumeId) return null;
  try {
    const data = await apiGet(db, `/volume/4050-${volumeId}/`, { field_list: 'publisher' });
    return data.results && data.results.publisher ? data.results.publisher.name : null;
  } catch {
    // Best-effort enrichment only — a failure here shouldn't block adding
    // the issue itself over a field that's a nice-to-have, not essential.
    return null;
  }
}

// Full detail for one issue by id — used for actually adding/rematching
// and for a metadata refresh. Issue ids need the "4000-" resource-type
// prefix in the detail URL; the bare numeric id from search results does
// not carry it.
async function getIssueDetails(db, issueId) {
  const data = await apiGet(db, `/issue/4000-${issueId}/`, {
    field_list: 'id,name,issue_number,cover_date,description,image,volume,person_credits',
  });
  const issue = data.results;
  const publisher = await getVolumePublisher(db, issue.volume ? issue.volume.id : null);
  return {
    id: issue.id,
    series: issue.volume ? issue.volume.name : null,
    issue_number: issue.issue_number,
    // Issues are very often untitled (a blank `name`) — fall back to
    // "Series #N" so every comic still has a real, non-empty title.
    title: issue.name || `${issue.volume ? issue.volume.name : 'Unknown'} #${issue.issue_number}`,
    description: stripHtml(issue.description),
    publisher,
    cover_date: issue.cover_date || null,
    year: issue.cover_date ? Number(issue.cover_date.slice(0, 4)) : null,
    cover_url: issue.image ? issue.image.medium_url || issue.image.small_url : null,
    creators: parseCreators(issue.person_credits),
  };
}

module.exports = { getApiKey, searchVolumes, findIssueInVolume, searchIssues, getIssueDetails };
