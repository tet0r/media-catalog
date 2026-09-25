// Reads a user's own LaunchBox (launchbox-app.com) installation directly
// off disk, rather than talking to the LaunchBox Games Database over the
// network — LaunchBox has no public search/lookup API, and its
// robots.txt-adjacent policies don't offer a documented, scraping-free path
// to one. But the desktop app itself already downloads per-platform game
// metadata (title, platform, developer, genre, box art, ...) as plain XML
// + image files for offline use, and the user has already done the actual
// matching work by importing/identifying these games in LaunchBox. So this
// just reads that existing local library — LAUNCHBOX_DIR (typically a
// mounted network share, since LaunchBox usually runs on a different PC
// than this server) pointing at the root LaunchBox folder containing
// Data/Platforms/*.xml and Images/<platform>/Box - Front/.
const fs = require('fs');
const path = require('path');

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// LaunchBox's per-platform XML is a small, predictable, flat schema (each
// <Game> block's children are plain text leaves, no attributes) — a
// dedicated regex extraction rather than a full XML parser, same rationale
// as epubMetadata.js's extractTag for EPUB's OPF metadata block.
function extractField(gameXml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = gameXml.match(re);
  if (!m) return null;
  const text = decodeXmlEntities(m[1].trim());
  return text || null;
}

function parseGameBlock(gameXml) {
  const title = extractField(gameXml, 'Title');
  const applicationPath = extractField(gameXml, 'ApplicationPath');
  if (!title) return null;
  return {
    launchbox_id: extractField(gameXml, 'ID'),
    database_id: extractField(gameXml, 'DatabaseID'),
    title,
    platform: extractField(gameXml, 'Platform'),
    developer: extractField(gameXml, 'Developer'),
    publisher: extractField(gameXml, 'Publisher'),
    genres: (extractField(gameXml, 'Genre') || '')
      .split(';')
      .map((g) => g.trim())
      .filter(Boolean),
    release_date: extractField(gameXml, 'ReleaseDate'),
    overview: extractField(gameXml, 'Notes'),
    rating: extractField(gameXml, 'Rating'),
    version: extractField(gameXml, 'Version'),
    file_path: applicationPath,
  };
}

// Only top-level <Game> blocks — a platform file also lists
// <AdditionalApplication> entries (DLC/expansions/alternate launchers) as
// siblings, not children, of the <Game> they belong to, so a naive
// "everything between the outer tags" split would never see them anyway;
// this regex only ever matches <Game>...</Game> spans.
function parsePlatformXml(xml) {
  const blocks = xml.match(/<Game>[\s\S]*?<\/Game>/g) || [];
  return blocks.map(parseGameBlock).filter((g) => g && g.launchbox_id);
}

function listPlatformFiles(dataDir) {
  const platformsDir = path.join(dataDir, 'Data', 'Platforms');
  let entries = [];
  try {
    entries = fs.readdirSync(platformsDir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.toLowerCase().endsWith('.xml'))
    .map((f) => path.join(platformsDir, f));
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

// LaunchBox image filenames are the game title with punctuation mangled
// somehow — a colon in "Anno 1701: History Edition" becomes an underscore
// ("Anno 1701_ History Edition-01.jpg"), but that's not even consistent:
// "Mirror's Edge" (straight apostrophe) also became "Mirror_s Edge", while
// another game's straight apostrophe in its <Title> shows up as a curly
// '’' in its actual filename instead — evidently these were named by
// different tools/contributors over the community database's history, not
// one deterministic rule. Rather than chase every variant, strip all
// punctuation from both sides before comparing — a comparison that
// survives underscore/apostrophe-style/colon/whatever else shows up.
function normalizeForMatch(str) {
  return str.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// LaunchBox doesn't only look in "Box - Front" for a game's cover — a
// digital-only (Steam/GOG/Epic/...) title usually has no physical box scan
// at all, so LaunchBox's own UI falls back through an ordered list of
// image types (store poster art first, physical box art after) recorded in
// Data/Settings.xml as FrontImageTypePriorities. Matching that same order
// here is the difference between "most games have no cover" and "covers
// look the same as they do inside LaunchBox itself".
const DEFAULT_FRONT_IMAGE_PRIORITIES = [
  'GOG Poster', 'Steam Poster', 'Epic Games Poster', 'Amazon Poster',
  'Box - Front', 'Box - Front - Reconstructed', 'Advertisement Flyer - Front',
  'Origin Poster', 'Uplay Thumbnail', 'Fanart - Box - Front', 'Poster',
  'Square', 'Steam Banner',
];

function getFrontImagePriorities(dataDir) {
  try {
    const xml = fs.readFileSync(path.join(dataDir, 'Data', 'Settings.xml'), 'utf8');
    const list = extractField(xml, 'FrontImageTypePriorities');
    if (list) return list.split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    /* fall through to the default below */
  }
  return DEFAULT_FRONT_IMAGE_PRIORITIES;
}

function findTitleInDir(dir, wanted) {
  let files = [];
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const match = files.find((f) => {
    if (!f.isFile()) return false;
    const ext = path.extname(f.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return false;
    const base = f.name.slice(0, -ext.length).replace(/-\d+$/, '');
    return normalizeForMatch(base) === wanted;
  });
  return match ? path.join(dir, match.name) : null;
}

// A given image-type folder (e.g. "Steam Poster") can hold files directly
// AND region subfolders (World, United States, ...) side by side — not
// consistently one or the other — so both have to be checked.
function findInImageTypeFolder(typeDir, wanted) {
  const direct = findTitleInDir(typeDir, wanted);
  if (direct) return direct;
  let entries = [];
  try {
    entries = fs.readdirSync(typeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  for (const region of entries) {
    const found = findTitleInDir(path.join(typeDir, region), wanted);
    if (found) return found;
  }
  return null;
}

// Walks the same FrontImageTypePriorities order LaunchBox itself uses,
// returning the first match across every image type — see above. Accepts
// the already-read priorities list so a full sync (hundreds of games)
// doesn't re-read and re-parse Settings.xml once per game.
function findCoverImage(dataDir, platform, title, priorities = getFrontImagePriorities(dataDir)) {
  const wanted = normalizeForMatch(title);
  for (const imageType of priorities) {
    const typeDir = path.join(dataDir, 'Images', platform, imageType);
    const found = findInImageTypeFolder(typeDir, wanted);
    if (found) return found;
  }
  return null;
}

// Reads every platform file and returns the full flattened game list, each
// annotated with its resolved local cover image path (or null). Skips a
// platform file that fails to parse (e.g. LaunchBox rewriting it mid-read)
// rather than aborting the whole sync over one bad file.
function listAllGames(dataDir) {
  const priorities = getFrontImagePriorities(dataDir);
  const games = [];
  for (const file of listPlatformFiles(dataDir)) {
    let xml;
    try {
      xml = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = parsePlatformXml(xml);
    } catch {
      continue;
    }
    for (const game of parsed) {
      const coverPath = game.platform ? findCoverImage(dataDir, game.platform, game.title, priorities) : null;
      games.push({ ...game, cover_path: coverPath });
    }
  }
  return games;
}

module.exports = { listAllGames, parsePlatformXml, findCoverImage };
