const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

function cleanTitle(str) {
  return str
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-]+|[\s\-([]+$/g, '')
    .trim();
}

// Given a bare name (folder or filename, without extension), guess a movie
// title and release year the way Radarr/Jellyfin-style scrapers do: take
// everything before the first standalone 19xx/20xx year token as the title.
function parseNameForTitleYear(name) {
  const yearMatch = name.match(YEAR_RE);
  let title = name;
  let year = null;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    title = name.slice(0, yearMatch.index);
  }
  title = cleanTitle(title);
  return { title, year };
}

module.exports = { parseNameForTitleYear, cleanTitle, YEAR_RE };
