const fs = require('fs');
const path = require('path');
const { parseNameForTitleYear } = require('./filenameParser');
const { VIDEO_EXTENSIONS } = require('./scanner');

// Only used to sanity-check a folder actually holds video somewhere inside
// (any depth) before treating it as a show — never used to identify
// individual episodes, since a TV show's unit of identity here is its own
// top-level folder, not what's inside it.
function hasVideoFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasVideoFile(full)) return true;
    } else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return true;
    }
  }
  return false;
}

// Only the immediate child folders of a TV root count as shows — a scan
// never descends into "Cheers/Season 1" as a thing separate from "Cheers"
// itself; that's the whole point of treating a show as one folder-level
// item instead of walking every video file the way Movies does.
function walkShowFolders(rootDir) {
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(rootDir, entry.name);
    if (hasVideoFile(full)) folders.push({ path: full, name: entry.name });
  }
  return folders;
}

function guessTitleYear(folderName) {
  return parseNameForTitleYear(folderName);
}

module.exports = { walkShowFolders, guessTitleYear };
