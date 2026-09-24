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

// LaunchBox names image files after the game title, but sanitizes it like
// any Windows filename first — a colon in "Anno 1701: History Edition"
// becomes "Anno 1701_ History Edition-01.jpg" on disk — so the same
// substitution has to happen here before comparing, or every title
// containing one of these characters silently never matches its cover.
function sanitizeForFilename(title) {
  return title.replace(/[\\/:*?"<>|]/g, '_');
}

// Box art lives at Images/<platform>/Box - Front/<region>/<title>-01.<ext>
// — region subfolders vary (World, United States, North America, ...) and
// aren't recorded per-game, so every region present has to be checked.
function findCoverImage(dataDir, platform, title) {
  const boxFrontDir = path.join(dataDir, 'Images', platform, 'Box - Front');
  let regions = [];
  try {
    regions = fs.readdirSync(boxFrontDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  const wanted = sanitizeForFilename(title).toLowerCase();
  for (const region of regions) {
    const regionDir = path.join(boxFrontDir, region);
    let files = [];
    try {
      files = fs.readdirSync(regionDir);
    } catch {
      continue;
    }
    const match = files.find((f) => {
      const ext = path.extname(f).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return false;
      const base = f.slice(0, -ext.length).replace(/-\d+$/, '');
      return base.toLowerCase() === wanted;
    });
    if (match) return path.join(regionDir, match);
  }
  return null;
}

// Reads every platform file and returns the full flattened game list, each
// annotated with its resolved local cover image path (or null). Skips a
// platform file that fails to parse (e.g. LaunchBox rewriting it mid-read)
// rather than aborting the whole sync over one bad file.
function listAllGames(dataDir) {
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
      const coverPath = game.platform ? findCoverImage(dataDir, game.platform, game.title) : null;
      games.push({ ...game, cover_path: coverPath });
    }
  }
  return games;
}

module.exports = { listAllGames, parsePlatformXml, findCoverImage };
