const fs = require('fs');
const path = require('path');

const M4B_EXTENSIONS = new Set(['.m4b']);
const OTHER_AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.aac']);

// Natural sort ("Part 2" before "Part 10") so a multi-file book's parts end
// up in the right playback order regardless of zero-padding conventions.
function naturalSort(filePaths) {
  return [...filePaths].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
  );
}

// Groups audio files into one entry per audiobook, folder by folder, rather
// than the file-per-entry approach movies use — an audiobook can be a
// single .m4b OR a folder full of .mp3/.m4a parts, and those two layouts
// need to collapse to exactly one library entry each, not one per file.
//
// Rule per folder (non-recursive — subfolders are walked independently, so
// a series folder containing one sub-folder per book works naturally):
//  - Any .m4b file present: each .m4b is its OWN audiobook. Non-.m4b audio
//    files sitting alongside it are assumed to be an alternate rip of the
//    same book (e.g. someone kept both an .m4b and the .mp3s it was made
//    from) and are ignored, so a folder with both never becomes two
//    entries for what's really one book.
//  - No .m4b, but other audio files present: every one of those files is
//    treated as one part of a single multi-part audiobook, identified by
//    the FOLDER's path rather than any individual file's path.
function walkGrouped(dir, results = [], root = dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  const files = [];
  const subdirs = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) subdirs.push(full);
    else if (entry.isFile()) files.push(full);
  }

  const m4bFiles = files.filter((f) => M4B_EXTENSIONS.has(path.extname(f).toLowerCase()));
  const otherAudio = files.filter((f) => OTHER_AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));

  if (m4bFiles.length > 0) {
    for (const m4b of naturalSort(m4bFiles)) {
      results.push({ kind: 'm4b', path: m4b, parts: [m4b], folder: dir, root });
    }
  } else if (otherAudio.length > 0) {
    results.push({ kind: 'multi', path: dir, parts: naturalSort(otherAudio), folder: dir, root });
  }

  for (const sub of subdirs) walkGrouped(sub, results, root);
  return results;
}

function walkAllRoots(dirs) {
  const results = [];
  for (const root of dirs) walkGrouped(root, results, root);
  return results;
}

const GENERIC_M4B_NAMES = new Set(['audiobook', 'book', 'output', 'combined', 'full']);

function cleanTitle(str) {
  return str
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-([]+|[\s\-([]+$/g, '')
    .trim();
}

// Unlike movies' filename parsing, audiobook titles don't reliably carry a
// year, and folder names are generally more trustworthy than track/chapter
// filenames — so this only ever guesses a title (used as the search query),
// not a year. "(Unabridged)"/"(Abridged)" is extremely common in audiobook
// naming and would otherwise pollute the search query, so it's stripped.
function guessTitle(group) {
  const folderName = cleanTitle(path.basename(group.folder));
  let guess = folderName;

  if (group.kind === 'm4b') {
    const fileBase = cleanTitle(path.basename(group.path, path.extname(group.path)));
    if (fileBase.length > 3 && !GENERIC_M4B_NAMES.has(fileBase.toLowerCase())) {
      guess = fileBase;
    }
  }

  return guess.replace(/\s*\((?:un)?abridged\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { walkGrouped, walkAllRoots, guessTitle, naturalSort, M4B_EXTENSIONS, OTHER_AUDIO_EXTENSIONS };
