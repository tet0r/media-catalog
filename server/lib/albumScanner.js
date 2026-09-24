const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg']);

// Detects a trailing "Part/Pt/Disc/CD/Volume/Vol N" marker on an
// already-cleaned name — same idea (and same regex) as audiobookScanner's
// PART_MARKER_RE, but applied here to whole ALBUM folders (each disc of a
// multi-disc release is its own folder full of tracks, e.g. "The Wall
// CD1"/"The Wall CD2" as siblings) rather than to individual files within
// one folder. Returns { base, num } (base with the marker stripped) or
// null.
const DISC_MARKER_RE = /^(.*?)[\s_.\-]*[,([]?\s*(?:part|pt\.?|disc|cd|volume|vol\.?)\s*0*(\d+)(?:\s+of\s+\d+)?[)\]]?\s*$/i;

function splitDiscMarker(cleanedName) {
  const m = cleanedName.match(DISC_MARKER_RE);
  if (!m) return null;
  const base = m[1].trim().replace(/[\s_.\-]+$/, '');
  if (!base) return null;
  return { base, num: parseInt(m[2], 10) };
}

function naturalSort(filePaths) {
  return [...filePaths].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
  );
}

function cleanName(str) {
  return str
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-([]+|[\s\-([]+$/g, '')
    .trim();
}

// One album = one folder containing audio files directly (its tracks), not
// one per file — same "the folder is the unit of identity" idea as
// audiobooks' multi-part case, but here every album is folder-grouped,
// never a single loose file. A folder that has audio files directly in it
// is treated as an album leaf regardless of whether it also has
// subfolders (a bonus-disc or artwork subfolder alongside the main tracks
// doesn't stop the parent from being the album — that subfolder gets
// walked too and becomes its own separate album if it has audio of its
// own, e.g. a genuine bonus disc).
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

  const tracks = files.filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));
  if (tracks.length > 0) {
    results.push({ path: dir, tracks: naturalSort(tracks), root });
  }

  for (const sub of subdirs) walkGrouped(sub, results, root);
  return results;
}

// Merges sibling disc-folders of the same multi-disc release (e.g. "The
// Wall CD1" and "The Wall CD2" under the same parent) into one album group
// — needs at least 2 folders sharing a base to count, so a lone folder
// that happens to say "Disc 1" with no sibling isn't treated as anything
// special, same reasoning as audiobooks' groupM4bFiles. Every group (not
// just merged ones) gets a `paths` array so callers can treat the two
// cases uniformly.
function mergeMultiDiscGroups(groups) {
  const parsed = groups.map((g) => {
    const cleaned = cleanName(path.basename(g.path));
    const split = splitDiscMarker(cleaned);
    return { group: g, base: split?.base ?? null, num: split?.num ?? 0 };
  });

  const byKey = new Map();
  for (const p of parsed) {
    if (!p.base) continue;
    const key = `${path.dirname(p.group.path)}::${p.base.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }

  const groupedPaths = new Set();
  const merged = [];
  for (const items of byKey.values()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.num - b.num);
    for (const it of items) groupedPaths.add(it.group.path);
    merged.push({
      path: items[0].group.path,
      paths: items.map((it) => it.group.path),
      tracks: items.flatMap((it) => it.group.tracks),
      root: items[0].group.root,
      albumNameOverride: items[0].base,
    });
  }

  const singles = groups
    .filter((g) => !groupedPaths.has(g.path))
    .map((g) => ({ ...g, paths: [g.path] }));

  return [...merged, ...singles];
}

function walkAllRoots(dirs) {
  const results = [];
  for (const root of dirs) walkGrouped(root, results, root);
  return mergeMultiDiscGroups(results);
}

// Guesses {artist, album} from a folder's own name and its parent, since
// music libraries commonly use either "Artist/Album/tracks" (two nested
// folders) or "Artist - Album/tracks" (one flat folder combining both) —
// this handles either without needing to know in advance which one a given
// library uses. The nested-folder reading is checked first and, when it
// applies, taken as-is (dashes and all) rather than also dash-splitting the
// album folder's own name — otherwise something like
// "Various Artists/Now That's What I Call Music - Vol 1" would wrongly get
// its title chopped at the dash, since a real parent-folder artist is a
// much stronger signal than a dash appearing anywhere in the album name.
// Only when there's no useful parent folder (the album folder sits right
// under the scan root) does a dash in its own name get treated as an
// artist/album separator.
function guessArtistAlbum(group) {
  // A merged multi-disc group already has its album name extracted (the
  // shared base with the Disc/CD marker stripped) — that's a better guess
  // than the disc-1 folder's own raw name ("The Wall CD1").
  if (group.albumNameOverride) {
    const parentDir = path.dirname(group.path);
    const artist = path.resolve(parentDir) !== path.resolve(group.root) ? cleanName(path.basename(parentDir)) : null;
    return { artist, album: group.albumNameOverride };
  }

  const folderName = cleanName(path.basename(group.path));
  const parentDir = path.dirname(group.path);
  if (path.resolve(parentDir) !== path.resolve(group.root)) {
    return { artist: cleanName(path.basename(parentDir)), album: folderName };
  }

  const dashSplit = folderName.split(/\s+-\s+/);
  if (dashSplit.length >= 2) {
    return { artist: dashSplit[0].trim(), album: dashSplit.slice(1).join(' - ').trim() };
  }

  return { artist: null, album: folderName };
}

module.exports = { walkAllRoots, guessArtistAlbum, splitDiscMarker, cleanName, AUDIO_EXTENSIONS };
