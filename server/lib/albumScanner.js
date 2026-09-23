const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg']);

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

function walkAllRoots(dirs) {
  const results = [];
  for (const root of dirs) walkGrouped(root, results, root);
  return results;
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

module.exports = { walkAllRoots, guessArtistAlbum, AUDIO_EXTENSIONS };
