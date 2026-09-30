// A generic "find a relevant picture for this name" fallback — used by
// every group-image search (author/series/artist/platform/collection)
// alongside whichever more specific source exists for that type (or
// alone, for Games' platforms, where no free specialized image API
// exists at all). Needs no API key; Wikipedia's own search + pageimages
// combo reliably has *something* for almost any notable name.
const BASE = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';

// Wikipedia's `pageimages` prop doesn't work for every page — notably,
// some heavily-templated infoboxes (e.g. the "Batman" article itself)
// don't expose one via the API at all even though the page visually has
// one. Rather than ask for exactly `limit` search results and then filter
// (which can leave nothing, since the top match often has no usable
// pageimage), a much larger pool is searched and *then* filtered/trimmed
// down to `limit` — still one request, just fetching more candidates than
// will actually be shown.
const SEARCH_POOL_SIZE = 20;

async function searchImages(query, limit = 6) {
  if (!query) return [];
  const url = new URL(BASE);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrlimit', String(SEARCH_POOL_SIZE));
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail|original');
  url.searchParams.set('pithumbsize', '400');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia request failed: ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages || {};
  return Object.values(pages)
    // Sorted by Wikipedia's own relevance order (the "index" field), and
    // only pages that actually have an image — a matching title with no
    // picture at all isn't a usable candidate here.
    .filter((p) => p.thumbnail)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .slice(0, limit)
    .map((p) => ({
      url: p.original?.source || p.thumbnail.source,
      thumbnail_url: p.thumbnail.source,
      label: p.title,
    }));
}

module.exports = { searchImages };
