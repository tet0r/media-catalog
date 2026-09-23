const fs = require('fs');
const path = require('path');

const EBOOK_EXTENSIONS = new Set(['.epub', '.pdf', '.mobi', '.azw3']);

function walk(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EBOOK_EXTENSIONS.has(ext)) results.push(full);
    }
  }
  return results;
}

function cleanTitle(str) {
  return str
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-([]+|[\s\-([]+$/g, '')
    .trim();
}

// A short "SeriesName NN" segment (e.g. "Malazan 03") — distinguishable
// from a real title because it's a name followed by a bare number, not
// prose.
const SERIES_MARKER_RE = /^[\w' ]{2,40}\s+\d{1,3}$/;

// Ebook filenames don't follow one dominant convention the way movies
// ("Title (Year)") or audiobooks (folder = one book) do, but shared ebook
// collections very commonly use one specific scheme: the author bookends
// the whole filename around an optional series marker and the title —
// "Lastname, First - Series NN - Title - Lastname, First". Fed straight to
// a title search, that whole string is noise Open Library's search can't
// resolve at all (not just a near-miss); stripping the repeated author and
// any series-number segment recovers just "Title".
//
// Any other dash-separated shape (a plain "Author - Title" or "Title -
// Author", with no bookend repeat) is genuinely ambiguous about which side
// is the title, so it's left as the full cleaned string rather than risk
// guessing the wrong segment — same reasoning as before.
function guessTitle(filePath) {
  const raw = cleanTitle(path.basename(filePath, path.extname(filePath)));
  const segments = raw.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 3) return raw;

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first.toLowerCase() !== last.toLowerCase()) return raw;

  const middle = segments.slice(1, -1).filter((s) => !SERIES_MARKER_RE.test(s));
  if (middle.length === 0) return raw;
  return middle[middle.length - 1];
}

module.exports = { walk, guessTitle, EBOOK_EXTENSIONS };
