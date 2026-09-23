// Book metadata via Open Library's free, key-free public API — no official
// docs page, but a long-stable one several other self-hosted/library tools
// rely on the same way Audiobookshelf relies on Audnexus.
//
// search.json carries almost everything a candidate needs (title, authors,
// year, cover, genres, language, publisher, ISBN, page count) directly on
// the result doc. The one thing it doesn't carry is the description, which
// only lives on the works/{id}.json record — so a full lookup re-searches
// by title to backfill those other fields onto the work's key, rather than
// resolving each author key via a separate /authors/{id} request per author.

const SEARCH_BASE = 'https://openlibrary.org/search.json';
const WORKS_BASE = 'https://openlibrary.org/works';

function coverUrl(coverId, size = 'L') {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

// "/works/OL27448W" -> "OL27448W"
function workKeyFromPath(key) {
  return key ? key.replace(/^\/works\//, '') : null;
}

function toCandidate(doc) {
  return {
    key: workKeyFromPath(doc.key),
    title: doc.title,
    authors: doc.author_name || [],
    year: doc.first_publish_year || null,
    cover_url: coverUrl(doc.cover_i),
    language: (doc.language || [])[0] || null,
    publisher: (doc.publisher || [])[0] || null,
    page_count: doc.number_of_pages_median || null,
    isbn: (doc.isbn || [])[0] || null,
    genres: (doc.subject || []).slice(0, 8),
  };
}

async function searchBooks(query) {
  if (!query) return [];
  const url = new URL(SEARCH_BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '15');
  url.searchParams.set(
    'fields',
    'key,title,author_name,first_publish_year,cover_i,subject,language,isbn,number_of_pages_median,publisher'
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`);
  const data = await res.json();
  return (data.docs || []).filter((d) => d.key).map(toCandidate);
}

// Full detail for one book by work key — used both for Add/resolving a
// Needs Review item and for a metadata refresh.
async function getBookByKey(key) {
  const res = await fetch(`${WORKS_BASE}/${encodeURIComponent(key)}.json`);
  if (!res.ok) throw new Error(`Open Library work lookup failed: ${res.status}`);
  const work = await res.json();
  const description = typeof work.description === 'string' ? work.description : work.description?.value || null;

  const matches = await searchBooks(work.title);
  const fields = matches.find((m) => m.key === key) || {};

  return {
    key,
    title: work.title,
    description,
    genres: ((work.subjects && work.subjects.length ? work.subjects : fields.genres) || []).slice(0, 8),
    authors: fields.authors || [],
    year: fields.year || null,
    cover_url: fields.cover_url || coverUrl(work.covers?.[0]),
    language: fields.language || null,
    publisher: fields.publisher || null,
    page_count: fields.page_count || null,
    isbn: fields.isbn || null,
  };
}

module.exports = { searchBooks, getBookByKey, coverUrl, workKeyFromPath };
