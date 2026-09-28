// Orchestrates ComicVine, Metron, and GCD as one combined comic-metadata
// search — added after ComicVine's own rate limits kept stalling matches
// even with comicvine.js's own pacing/backoff (see CHANGELOG v18.2):
// giving every search two more independent catalogs to fall through to
// means one source being rate-limited, unconfigured, or simply missing a
// series no longer has to end in Needs Review.
//
// Tried in order — ComicVine, then Metron, then GCD — stopping as soon as
// one source returns exactly one hit (the same "confident enough to
// auto-add" signal comicScan.js already used for a single source). A
// source that throws (no key/account configured, rate-limited, network
// error) or comes back ambiguous (0 or 2+ hits) doesn't fail the search —
// it just moves on to the next source, same as albumScan.js falling back
// from Last.fm to MusicBrainz, but per-search rather than decided once for
// a whole scan, since ComicVine's rate limiting is intermittent rather
// than a permanent "not configured" state.
//
// If nobody comes back confident, every source's hits are merged (deduped
// by series+issue, since the same real issue often exists in more than one
// catalog) so Needs Review shows everything found rather than just
// whichever source happened to run last.

const comicvine = require('./comicvine');
const metron = require('./metron');
const gcd = require('./gcd');
const { normalizeForMatch } = require('./titleMatch');

const SOURCES = [
  { key: 'comicvine', search: comicvine.searchIssues, details: comicvine.getIssueDetails },
  { key: 'metron', search: metron.searchIssues, details: metron.getIssueDetails },
  { key: 'gcd', search: gcd.searchIssues, details: gcd.getIssueDetails },
];

function dedupeKey(hit) {
  const issue = /^\d+$/.test(String(hit.issue_number)) ? String(parseInt(hit.issue_number, 10)) : String(hit.issue_number).trim();
  return `${normalizeForMatch(hit.series || '')}::${issue.toLowerCase()}`;
}

function dedupe(hits) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const key = dedupeKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

async function searchAllSources(db, seriesQuery, issueNumber, opts = {}) {
  const merged = [];
  const errors = [];

  for (const { key, search } of SOURCES) {
    try {
      const hits = await search(db, seriesQuery, issueNumber, opts);
      if (hits.length === 1) return hits;
      merged.push(...hits);
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  if (merged.length === 0 && errors.length === SOURCES.length) {
    throw new Error(errors.join('; '));
  }
  return dedupe(merged);
}

async function getIssueDetails(db, source, externalId) {
  const entry = SOURCES.find((s) => s.key === source);
  if (!entry) throw new Error(`Unknown comic source: ${source}`);
  return entry.details(db, externalId);
}

module.exports = { searchAllSources, getIssueDetails, SOURCES: SOURCES.map((s) => s.key) };
