const fs = require('fs');
const path = require('path');
const { parseNameForTitleYear } = require('./filenameParser');

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv', '.ts', '.m2ts']);

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
      if (VIDEO_EXTENSIONS.has(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

// Prefer the parent folder name when it looks like "Title (Year)" style
// naming (common for one-movie-per-folder libraries); otherwise fall back
// to the video filename itself.
function guessTitleYear(filePath, rootDir) {
  const parentDir = path.dirname(filePath);
  const parentFolder = path.basename(parentDir);
  const fileBase = path.basename(filePath, path.extname(filePath));

  if (path.resolve(parentDir) !== path.resolve(rootDir)) {
    const parentGuess = parseNameForTitleYear(parentFolder);
    if (parentGuess.year && parentGuess.title) return parentGuess;
  }
  return parseNameForTitleYear(fileBase);
}

module.exports = { walk, guessTitleYear, VIDEO_EXTENSIONS };
