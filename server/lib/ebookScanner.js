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

// Unlike movies ("Title (Year)") or audiobooks (folder = one book), ebook
// filenames don't follow one dominant convention — "Author - Title.epub",
// "Title.epub" inside an Author-named folder, and bare "Title.epub" are all
// common, and guessing which dash-separated segment is the title is
// genuinely ambiguous either way. So this just cleans the filename itself
// and leaves getting the right match to the search box in Needs Review,
// same as any other guess that misses.
function guessTitle(filePath) {
  return cleanTitle(path.basename(filePath, path.extname(filePath)));
}

module.exports = { walk, guessTitle, EBOOK_EXTENSIONS };
