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

// Detects a trailing "Part/Pt/Disc/CD/Volume/Vol N" marker, or a "N of M"
// marker, on an already-cleaned name — used to tell "Book Part 1.m4b" +
// "Book Part 2.m4b" (one book, split across two .m4b files) apart from
// "Book One.m4b" + "Book Two.m4b" (two genuinely different books sharing a
// folder). Returns { base, num } (base with the marker stripped) or null.
const PART_MARKER_RE = /^(.*?)[\s_.\-]*[,([]?\s*(?:part|pt\.?|disc|cd|volume|vol\.?)\s*0*(\d+)(?:\s+of\s+\d+)?[)\]]?\s*$/i;
const OF_MARKER_RE = /^(.*?)[\s_.\-]*[,([]?\s*0*(\d+)\s+of\s+\d+[)\]]?\s*$/i;

function splitPartMarker(cleanedName) {
  const m = cleanedName.match(PART_MARKER_RE) || cleanedName.match(OF_MARKER_RE);
  if (!m) return null;
  const base = m[1].trim().replace(/[\s_.\-]+$/, '');
  if (!base) return null;
  return { base, num: parseInt(m[2], 10) };
}

// Splits a folder's .m4b files into books split across multiple files
// (grouped by a shared base name once a Part/Disc/CD/Volume/N-of-M marker
// is stripped — needs at least 2 files sharing a base to count, so a lone
// file that happens to say "Part 1" with no sibling isn't treated as
// anything special) and books that are each their own single .m4b file.
function groupM4bFiles(m4bFiles) {
  const parsed = m4bFiles.map((file) => {
    const cleaned = cleanTitle(path.basename(file, path.extname(file)));
    const split = splitPartMarker(cleaned);
    return { file, base: split?.base ?? null, num: split?.num ?? 0 };
  });

  const byBase = new Map();
  for (const p of parsed) {
    if (!p.base) continue;
    const key = p.base.toLowerCase();
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(p);
  }

  const groupedFiles = new Set();
  const multiPartGroups = [];
  for (const items of byBase.values()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.num - b.num);
    for (const it of items) groupedFiles.add(it.file);
    multiPartGroups.push({ files: items.map((it) => it.file), title: items[0].base });
  }

  const singleFiles = naturalSort(parsed.filter((p) => !groupedFiles.has(p.file)).map((p) => p.file));
  return { multiPartGroups, singleFiles };
}

// Groups audio files into one entry per audiobook, folder by folder, rather
// than the file-per-entry approach movies use — an audiobook can be a
// single .m4b, several .m4b files that are really parts of one book, or a
// folder full of .mp3/.m4a parts, and all of those need to collapse to
// exactly one library entry each, not one per file.
//
// Rule per folder (non-recursive — subfolders are walked independently, so
// a series folder containing one sub-folder per book works naturally):
//  - .m4b files present: files sharing a base name (see groupM4bFiles)
//    become one multi-part book each; everything else is its own
//    single-file book. Non-.m4b audio files sitting alongside any of this
//    are assumed to be an alternate rip of the same book(s) (e.g. someone
//    kept both an .m4b and the .mp3s it was made from) and are ignored, so
//    a folder with both never becomes extra entries for what's really the
//    same book(s).
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
    const { multiPartGroups, singleFiles } = groupM4bFiles(m4bFiles);
    for (const g of multiPartGroups) {
      results.push({ kind: 'm4b-multi', path: g.files[0], parts: g.files, folder: dir, root, titleHint: g.title });
    }
    for (const f of singleFiles) {
      results.push({ kind: 'm4b', path: f, parts: [f], folder: dir, root });
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

// Some rippers name things "Author - Year - Title" (dash-separated fields,
// the same convention Radarr/Jellyfin-style movie naming uses but applied
// per-field here rather than just trimming a trailing year). A literal
// year as an Audible search keyword tends to suppress otherwise-good
// matches rather than narrow them usefully, so it's dropped from the
// query — but only when it's clearly its own metadata field: at least 3
// dash-separated segments, with one of them being nothing but a 4-digit
// 19xx/20xx year. A 2-segment name is left untouched, since "Author -
// 1984" is genuinely ambiguous between "Author - Year" (incomplete
// metadata) and "Author - Title" where the title itself is "1984" — not
// worth risking a real title getting silently deleted to fix the 3-segment
// case.
function stripYearSegment(title) {
  const segments = title.split(/\s*-\s*/);
  if (segments.length < 3) return title;
  const filtered = segments.filter((seg) => !/^(19|20)\d{2}$/.test(seg.trim()));
  if (filtered.length === segments.length) return title;
  return filtered.join(' - ').trim();
}

// Unlike movies' filename parsing, audiobook titles don't reliably carry a
// year, and folder names are generally more trustworthy than track/chapter
// filenames — so this only ever guesses a title (used as the search query),
// not a year. "(Unabridged)"/"(Abridged)" is extremely common in audiobook
// naming and would otherwise pollute the search query, so it's stripped.
function guessTitle(group) {
  let guess;
  // A multi-part .m4b group already has its title extracted (the shared
  // base name with the Part/Disc/CD marker stripped) — that's a better
  // guess than the folder name or any one part's own filename.
  if (group.titleHint) {
    guess = group.titleHint;
  } else {
    guess = cleanTitle(path.basename(group.folder));
    if (group.kind === 'm4b') {
      const fileBase = cleanTitle(path.basename(group.path, path.extname(group.path)));
      if (fileBase.length > 3 && !GENERIC_M4B_NAMES.has(fileBase.toLowerCase())) {
        guess = fileBase;
      }
    }
  }

  guess = stripYearSegment(guess);
  return guess.replace(/\s*\((?:un)?abridged\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  walkGrouped, walkAllRoots, guessTitle, naturalSort, splitPartMarker, groupM4bFiles, stripYearSegment,
  M4B_EXTENSIONS, OTHER_AUDIO_EXTENSIONS,
};
