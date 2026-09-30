// Artist images for Albums/Vinyl's "group by artist" picture search —
// Deezer's public search API needs no key at all and reliably has a real
// photo for almost any artist with a music-streaming presence, unlike
// Last.fm (whose artist images were deprecated/replaced with a generic
// placeholder for most artists some years back).
const BASE = 'https://api.deezer.com';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';

async function searchImages(query, limit = 6) {
  if (!query) return [];
  const url = new URL(`${BASE}/search/artist`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Deezer request failed: ${res.status}`);
  const data = await res.json();
  // A placeholder "artist not found" picture is still a real URL Deezer
  // returns for artists with no photo — nb_fan === 0 is usually one of
  // these low-quality/unmatched entries, filtered out same as Wikipedia
  // pages with no thumbnail at all.
  return (data.data || [])
    .filter((a) => a.picture_medium)
    .map((a) => ({
      url: a.picture_big || a.picture_medium,
      thumbnail_url: a.picture_medium,
      label: a.name,
    }));
}

module.exports = { searchImages };
