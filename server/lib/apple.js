// Apple's iTunes Search API — unlike Audible's, this one is official and
// documented (https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/),
// free, and needs no API key. Used as a second, independent search source:
// Audible's own catalog occasionally misses a title Apple Books carries
// (or the reverse), and giving up after one source is a dead end for
// those books.

const SEARCH_BASE = 'https://itunes.apple.com/search';
const LOOKUP_BASE = 'https://itunes.apple.com/lookup';

// Apple bakes "(Unabridged)"/"(Abridged)" into the collection name itself
// rather than exposing it as a separate field — stripped here so it
// doesn't end up duplicated with the abridged flag shown elsewhere.
function cleanCollectionName(name) {
  return (name || '').replace(/\s*\((?:un)?abridged\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

// Search results only ever give a 100x100 thumbnail; the URL encodes the
// requested size and tolerates asking for something much bigger.
function upsizeArtwork(url) {
  return url ? url.replace(/\d+x\d+bb\.(jpg|png)$/, '600x600bb.$1') : null;
}

function toCandidate(r) {
  return {
    asin: String(r.collectionId),
    title: cleanCollectionName(r.collectionName),
    subtitle: null,
    authors: r.artistName ? [r.artistName] : [],
    release_date: r.releaseDate ? r.releaseDate.slice(0, 10) : null,
    cover_url: upsizeArtwork(r.artworkUrl100),
  };
}

async function searchAudiobooks(query) {
  if (!query) return [];
  const url = new URL(SEARCH_BASE);
  url.searchParams.set('term', query);
  url.searchParams.set('media', 'audiobook');
  url.searchParams.set('limit', '15');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple Books search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(toCandidate);
}

async function getAudiobookById(id) {
  const url = new URL(LOOKUP_BASE);
  url.searchParams.set('id', id);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple Books lookup failed: ${res.status}`);
  const data = await res.json();
  const result = (data.results || [])[0];
  if (!result) throw new Error(`No Apple Books audiobook found for id ${id}`);
  return result;
}

module.exports = { searchAudiobooks, getAudiobookById, cleanCollectionName, upsizeArtwork };
