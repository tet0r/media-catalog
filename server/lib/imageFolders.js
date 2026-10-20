const path = require('path');
const db = require('../db');
const { getLibraryDirs } = require('./libraryPaths');

// Which folder an item's images belong in, for the libraries that are scanned
// from folders on disk (Movies, TV Shows, Audiobooks, Ebooks, Comics, Music):
// when a library has more than one library folder configured, each gets its own
// subfolder, so
//
//   Movies/Posters/the-matrix-1999-poster.jpg
//
// becomes, for a movie found under the library folder /movies2,
//
//   Movies/movies2/Posters/the-matrix-1999-poster.jpg
//
// An item that isn't under any configured library folder (added by hand, or its
// folder has since been removed from Settings) stays in the plain type folder,
// as do the libraries that don't scan folders (Vinyl, Games) and collections and
// group pictures, which can span several folders.

// Table -> the library type its folders are configured under.
const LIBRARY_TYPE = {
  movies: 'movies',
  tv_shows: 'tv',
  audiobooks: 'audiobooks',
  ebooks: 'ebooks',
  comics: 'comics',
  albums: 'albums',
};

const normalize = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const cleanLabel = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 60);

// A folder's label is its own name ("movies2", "Movies"). Two configured
// folders with the same name (D:\Movies and E:\Movies) get their parent's name
// put in front so they stay apart.
function labelsFor(dirs) {
  const basename = (d) => cleanLabel(path.posix.basename(String(d).replace(/\\/g, '/').replace(/\/+$/, '')));
  const counts = new Map();
  for (const d of dirs) counts.set(basename(d).toLowerCase(), (counts.get(basename(d).toLowerCase()) || 0) + 1);
  const used = new Set();
  return dirs.map((d, i) => {
    let label = basename(d) || `folder-${i + 1}`;
    if (counts.get(label.toLowerCase()) > 1) {
      const parts = String(d).replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
      label = cleanLabel(parts.slice(-2).join('-')) || label;
    }
    while (used.has(label.toLowerCase())) label += '-2';
    used.add(label.toLowerCase());
    return label;
  });
}

// Library folders change rarely but are looked up for every image in a pass,
// so the answer is kept for a few seconds.
const CACHE_MS = 5000;
const cache = new Map();

function rootsFor(type) {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.roots;
  let dirs = [];
  try {
    dirs = getLibraryDirs(type) || [];
  } catch {
    dirs = [];
  }
  const labels = labelsFor(dirs);
  // Longest folder first, so a library folder nested inside another wins.
  let roots = dirs
    .map((dir, i) => ({ prefix: normalize(dir), label: labels[i] }))
    .filter((r) => r.prefix)
    .sort((a, b) => b.prefix.length - a.prefix.length);
  // With a single library folder there's nothing to tell apart, so the images
  // stay in the plain type folder; the split only starts once a second folder
  // is added for that type.
  if (roots.length < 2) roots = [];
  cache.set(type, { at: Date.now(), roots });
  return roots;
}

function sourceLabel(type, filePath) {
  const file = normalize(filePath);
  if (!file) return null;
  const root = rootsFor(type).find((r) => file === r.prefix || file.startsWith(`${r.prefix}/`));
  return root ? root.label : null;
}

// 'Movies/Posters' + the file's library folder -> 'Movies/movies2/Posters'.
function folderFor(baseFolder, table, filePath) {
  const type = LIBRARY_TYPE[table];
  const label = type ? sourceLabel(type, filePath) : null;
  if (!label) return baseFolder;
  const parts = baseFolder.split('/');
  return [parts[0], label, ...parts.slice(1)].join('/');
}

// Same, looking the item up by id — for the places that only have the row's id.
function folderForItem(baseFolder, table, id) {
  if (!LIBRARY_TYPE[table]) return baseFolder;
  let row;
  try {
    row = db.prepare(`SELECT file_path FROM ${table} WHERE id = ?`).get(id);
  } catch {
    row = null;
  }
  return folderFor(baseFolder, table, row && row.file_path);
}

module.exports = { folderFor, folderForItem, LIBRARY_TYPE, resetCache: () => cache.clear() };
