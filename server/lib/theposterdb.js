const { normalizeForMatch } = require('./titleMatch');

// ThePosterDB has no official API. This scrapes their public search and
// movie pages with plain HTTP requests (no login, no headless browser) —
// verified to work without hitting their Cloudflare bot-challenge, but it
// depends entirely on their current page markup and could break if that
// changes. If poster search suddenly stops finding results, check whether
// the regexes below still match https://theposterdb.com's actual HTML.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`ThePosterDB request failed: ${res.status}`);
  return res.text();
}

// Search results list movies as: <a href=".../posters/<id>"> <strong>Title</strong> (Year) </a>
function extractSearchResults(html) {
  const re = /<a[^>]*href="([^"]*\/posters\/\d+)"[^>]*>\s*<strong>([^<]*)<\/strong>\s*\(([^)]*)\)/g;
  const results = [];
  let m;
  while ((m = re.exec(html))) {
    results.push({ url: m[1], title: m[2].trim(), year: m[3].trim() });
  }
  return results;
}

// Each poster on a movie's page is a <picture> with a JPEG <source srcset="...">
// pointing at their images.theposterdb.com CDN.
function extractPosterImageUrls(html) {
  const re = /<source[^>]*type="image\/jpeg"[^>]*srcset="([^"]+)"/g;
  const urls = [];
  let m;
  while ((m = re.exec(html))) {
    urls.push(m[1]);
  }
  return urls;
}

async function findMoviePageUrl(title, year) {
  const html = await fetchHtml(`https://theposterdb.com/search?term=${encodeURIComponent(title)}&section=movies`);
  const results = extractSearchResults(html);
  const targetNorm = normalizeForMatch(title);

  const exact = results.find((r) => {
    const rYear = parseInt(r.year, 10);
    return normalizeForMatch(r.title) === targetNorm && (!year || !rYear || rYear === Number(year));
  });
  if (exact) return exact.url;

  const titleOnly = results.find((r) => normalizeForMatch(r.title) === targetNorm);
  return titleOnly ? titleOnly.url : null;
}

// A movie's page shows its posters 24 at a time (?page=2, ?page=3, ...), so
// reading only the first page limited the picker to 24 posters even for a movie
// with over a hundred. Pages are read one after another until one has nothing
// new — the cap just keeps a runaway page from looping — and a failure on a
// later page keeps what was already found rather than discarding it.
const MAX_POSTER_PAGES = 10;

async function getPosterUrls(title, year, maxPages = MAX_POSTER_PAGES) {
  const pageUrl = await findMoviePageUrl(title, year);
  if (!pageUrl) return [];
  const seen = new Set();
  const urls = [];
  for (let page = 1; page <= maxPages; page++) {
    let html;
    try {
      html = await fetchHtml(page === 1 ? pageUrl : `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}page=${page}`);
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    const fresh = extractPosterImageUrls(html).filter((u) => !seen.has(u));
    if (!fresh.length) break;
    for (const u of fresh) {
      seen.add(u);
      urls.push(u);
    }
  }
  return urls;
}

// A search returning zero results is ambiguous on its own: it could mean
// this specific movie genuinely has no posters there, or it could mean
// ThePosterDB changed its page markup and the regexes above no longer match
// anything at all. To tell those apart, re-run the same pipeline against a
// title known to reliably have dozens of posters — if THAT also comes back
// empty, the scraper itself is broken, not just this one search.
const CANARY_TITLE = 'The Matrix';
const CANARY_YEAR = 1999;
const CANARY_MIN_RESULTS = 5;
const HEALTH_CACHE_MS = 5 * 60 * 1000;

let healthCache = { checkedAt: 0, healthy: null };

async function isHealthy() {
  const now = Date.now();
  if (healthCache.healthy !== null && now - healthCache.checkedAt < HEALTH_CACHE_MS) {
    return healthCache.healthy;
  }
  let healthy;
  try {
    const urls = await getPosterUrls(CANARY_TITLE, CANARY_YEAR, 1);
    healthy = urls.length >= CANARY_MIN_RESULTS;
  } catch {
    healthy = false;
  }
  healthCache = { checkedAt: now, healthy };
  return healthy;
}

module.exports = { getPosterUrls, isHealthy };
