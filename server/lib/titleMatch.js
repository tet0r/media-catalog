const TRAILING_ARTICLE_RE = /^(.*),\s*(a|an|the)$/i;
const LEADING_ARTICLE_RE = /^(a|an|the)\s+/i;

// "Beautiful Day In The Neighborhood, A" -> "A Beautiful Day In The
// Neighborhood" — undoes the sort-friendly naming convention (article
// moved to the end) some libraries use, so the guessed title both reads
// naturally and searches TMDB the way a person would type it.
function reorderTrailingArticle(title) {
  const m = title.match(TRAILING_ARTICLE_RE);
  if (!m) return title;
  return `${m[2]} ${m[1]}`.replace(/\s+/g, ' ').trim();
}

// Canonical form used only to decide whether a guessed title and a TMDB
// candidate are "the same movie" for auto-matching. Collapses differences
// that commonly show up between a filename-derived guess and TMDB's actual
// title — leading/trailing article, colons, dashes, "vs." vs "vs" — without
// requiring them to already be reordered or punctuated identically.
function normalizeForMatch(title) {
  let s = title.toLowerCase();
  s = s.replace(TRAILING_ARTICLE_RE, '$1');
  s = s.replace(LEADING_ARTICLE_RE, '');
  s = s.replace(/\bvs\.?\b/g, 'vs');
  s = s.replace(/[:\-,.]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

module.exports = { reorderTrailingArticle, normalizeForMatch };
