const fs = require('fs');
const path = require('path');

// No archive contents are ever read here (no ComicInfo.xml parsing) —
// matching is filename-only for now. That's also why .cbr/.cb7 (RAR/7z)
// can be included at all: discovering a file and guessing from its name
// needs no archive-reading library, unlike actually opening one to pull
// out embedded metadata would.
const COMIC_EXTENSIONS = new Set(['.cbz', '.cbr', '.cb7']);

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
      if (COMIC_EXTENSIONS.has(ext)) results.push(full);
    }
  }
  return results;
}

module.exports = { walk, COMIC_EXTENSIONS };
