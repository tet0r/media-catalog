// Comic metadata via the Grand Comics Database's public API
// (https://www.comics.org/api/) — a third catalog alongside ComicVine and
// Metron (see comicSources.js). Unlike those two, GCD needs no account or
// key at all: it allows anonymous access, just with a lower hourly limit
// than a logged-in user gets (not implemented here — anonymous is enough
// to be a useful extra source, not the primary one).
//
// GCD's search is path-based, not a query filter, and — unlike ComicVine/
// Metron's separate "search series" then "find issue in that series" hops
// — it exposes series-name-plus-issue-number as ONE combined endpoint, so
// there's no separate searchVolumes() here.

const BASE = 'https://www.comics.org/api';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// No documented rate limit number for anonymous access beyond "some limits
// on the number of accesses per hour" — paced conservatively to be a good
// citizen of a free, shared community resource.
const MIN_REQUEST_INTERVAL_MS = 600;
let lastRequestAt = 0;

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_FALLBACK_MS = 3000;

async function apiGet(path) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}format=json`;

  for (let attempt = 0; ; attempt++) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 429) {
      if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new Error('GCD rate limit exceeded — try again later.');
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_FALLBACK_MS);
      continue;
    }
    if (!res.ok) throw new Error(`GCD request failed: ${res.status}`);
    return res.json();
  }
}

// Issue/series ids aren't given as a bare field on list-view results —
// only as the last numeric path segment of api_url (e.g.
// ".../api/issue/1108106/?format=json" -> 1108106).
function idFromApiUrl(apiUrl) {
  const m = String(apiUrl || '').match(/\/(\d+)\/(?:\?|$)/);
  return m ? m[1] : null;
}

// GCD's series names commonly carry a "(1995 series)"-style suffix to
// disambiguate reboots sharing a title — stripped for display, and reused
// below as a launch-year fallback when a result has no cover/publication
// date at all.
const SERIES_YEAR_RE = /\s*\((\d{4})[^)]*\)\s*$/;

function cleanSeriesName(name) {
  return String(name || '').replace(SERIES_YEAR_RE, '').trim();
}

function yearFromSeriesName(name) {
  const m = String(name || '').match(SERIES_YEAR_RE);
  return m ? Number(m[1]) : null;
}

function yearFromDate(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Combined series-name + issue-number search — GCD's one-hop equivalent of
// ComicVine/Metron's two-hop searchIssues. The list view is thin (no cover
// image, no title) compared to the full issue detail, same as every other
// source's search-vs-detail split; "descriptor" is filtered for an exact
// match since it can carry variant suffixes ("12 [Direct]") that a loose
// contains-match would otherwise let through as false positives.
async function searchIssues(db, seriesQuery, issueNumber, { maxHits = 8 } = {}) {
  if (!seriesQuery || !issueNumber) return [];
  const data = await apiGet(`/series/name/${encodeURIComponent(seriesQuery)}/issue/${encodeURIComponent(issueNumber)}/`);
  const wanted = String(issueNumber).trim();
  return (data.results || [])
    .filter((r) => String(r.descriptor || '').trim() === wanted)
    .slice(0, maxHits)
    .map((r) => ({
      id: idFromApiUrl(r.api_url),
      series: cleanSeriesName(r.series_name),
      issue_number: r.descriptor,
      title: null,
      cover_date: r.publication_date || null,
      year: yearFromDate(r.publication_date) || yearFromSeriesName(r.series_name),
      cover_url: null,
      publisher: null,
      source: 'gcd',
    }))
    .filter((hit) => hit.id);
}

// Full detail for one issue by id. Unlike the search/list view, the detail
// view does carry indicia_publisher as a plain name (not a URI reference
// needing a second request) and a cover image, so both are used here
// without any extra enrichment call.
async function getIssueDetails(db, issueId) {
  const issue = await apiGet(`/issue/${issueId}/`);
  const series = cleanSeriesName(issue.series_name);
  const description = (issue.story_set || [])
    .map((s) => s.synopsis)
    .filter(Boolean)
    .join(' ') || null;
  return {
    id: idFromApiUrl(issue.api_url) || issueId,
    series,
    issue_number: issue.number || issue.descriptor,
    title: issue.title || `${series || 'Unknown'} #${issue.number || issue.descriptor}`,
    description,
    publisher: issue.indicia_publisher || null,
    cover_date: issue.key_date || issue.publication_date || null,
    year: yearFromDate(issue.key_date) || yearFromDate(issue.publication_date) || yearFromSeriesName(issue.series_name),
    cover_url: issue.cover || null,
    creators: parseCredits(issue.story_set),
  };
}

// Story credits are five free-text fields per story (script/pencils/inks/
// colors/letters), each a comma-separated list of names sometimes suffixed
// with "(signed)"-style annotations — not structured {name, role} pairs
// like ComicVine/Metron give, so this is a best-effort parse, same spirit
// as ComicVine's publisher lookup: a nice-to-have, not core functionality.
const CREDIT_FIELDS = [
  ['script', 'writer'],
  ['pencils', 'artist'],
  ['inks', 'inker'],
  ['colors', 'colorist'],
  ['letters', 'letterer'],
];

function parseCredits(storySet) {
  const byName = new Map();
  for (const story of storySet || []) {
    for (const [field, role] of CREDIT_FIELDS) {
      const raw = story[field];
      if (!raw || raw === '?' || raw === 'None') continue;
      for (const name of raw.split(',').map((n) => n.replace(/\([^)]*\)/g, '').trim()).filter(Boolean)) {
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name).add(role);
      }
    }
  }
  return [...byName.entries()].map(([name, roles]) => ({ name, roles: [...roles] }));
}

module.exports = { searchIssues, getIssueDetails };
