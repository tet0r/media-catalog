// Audiobook metadata. Two services, both unofficial (no API key, no
// official docs) but widely relied on by the self-hosted audiobook
// community (Audiobookshelf uses the same pair under the hood):
//  - api.audible.com for free-text search (Audnexus doesn't offer one)
//  - api.audnex.us for full details by ASIN, aggregated from Audible

const AUDIBLE_SEARCH_BASE = 'https://api.audible.com/1.0/catalog/products';
const AUDNEXUS_BASE = 'https://api.audnex.us';

async function searchAudiobooks(query) {
  if (!query) return [];
  const url = new URL(AUDIBLE_SEARCH_BASE);
  url.searchParams.set('keywords', query);
  url.searchParams.set('num_results', '15');
  url.searchParams.set('products_sort_by', 'Relevance');
  url.searchParams.set('response_groups', 'product_desc,media,contributors');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audible search failed: ${res.status}`);
  const data = await res.json();
  return (data.products || []).map((p) => ({
    asin: p.asin,
    title: p.title,
    subtitle: p.subtitle || null,
    authors: (p.authors || []).map((a) => a.name),
    release_date: p.release_date || null,
    cover_url: p.product_images?.['500'] || p.product_images?.['1024'] || null,
  }));
}

async function getAudiobookByAsin(asin) {
  const res = await fetch(`${AUDNEXUS_BASE}/books/${encodeURIComponent(asin)}`);
  if (!res.ok) throw new Error(`Audnexus lookup failed: ${res.status}`);
  return res.json();
}

module.exports = { searchAudiobooks, getAudiobookByAsin };
