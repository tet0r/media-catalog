// Shared by both filename-based scan guessing and the free-typed search
// box (AddComic, Search Again, Needs Review) — same problem either way:
// given "Series Name ... issue marker", split out the issue number and
// leave the series name on its own, so callers never need their own
// parsing logic.

// A "#N" marker is the clearest possible signal, so it's tried first.
const HASH_MARKER_RE = /#\s*(\d+(?:\.\d+)?)/;
// Failing that, a trailing bare number (optionally with a decimal, for a
// half-numbered issue like "0.5") at the very end of the cleaned string.
const TRAILING_NUMBER_RE = /(\d+(?:\.\d+)?)\s*$/;

function stripParens(text) {
  return text.replace(/\([^()]*\)/g, ' ');
}

function cleanSeries(text) {
  return text
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-,:]+|[\s\-,:]+$/g, '')
    .trim();
}

// A pure-digit issue number is normalized (leading zeros stripped, "005"
// -> "5") to match how ComicVine itself stores most issue numbers; a
// non-pure-digit one (a half issue like "0.5", an annual like "1AU") is
// left exactly as found, since there's no safe way to "normalize" that.
function normalizeIssueNumber(raw) {
  return /^\d+$/.test(raw) ? String(parseInt(raw, 10)) : raw;
}

function parseSeriesAndIssue(text) {
  const withoutParens = stripParens(text || '');

  const hashMatch = withoutParens.match(HASH_MARKER_RE);
  if (hashMatch) {
    const series = cleanSeries(withoutParens.slice(0, hashMatch.index));
    if (series) return { series, issueNumber: normalizeIssueNumber(hashMatch[1]) };
  }

  const trailingMatch = withoutParens.match(TRAILING_NUMBER_RE);
  if (trailingMatch) {
    const series = cleanSeries(withoutParens.slice(0, trailingMatch.index));
    if (series) return { series, issueNumber: normalizeIssueNumber(trailingMatch[1]) };
  }

  // No issue number anywhere in the text at all — the normal case for a
  // one-shot, OGN, or trade paperback, which typically isn't numbered in
  // its filename the way a single issue is. Rather than give up on
  // searching entirely, default to "1": one-shots/OGNs are catalogued as
  // issue 1 of their volume on ComicVine, Metron, and GCD alike, so this
  // still finds them the vast majority of the time. Worst case (a real
  // annual/special numbered differently) is no worse than before — zero
  // hits, same as never searching — since the caller still requires
  // exactly one hit to auto-confident-match.
  const series = cleanSeries(withoutParens);
  return { series: series || null, issueNumber: series ? '1' : null };
}

module.exports = { parseSeriesAndIssue };
