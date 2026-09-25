const db = require('../db');
const audible = require('./audible');
const apple = require('./apple');
const path = require('path');
const { cacheImageFromUrl } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Audnexus summaries come as HTML ("<p><b>...</b>..."); this app has no
// other use for rich text, so strip tags down to plain text rather than
// pull in an HTML parser for one field.
function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Shared by both a fresh add and a metadata refresh, so the two never drift
// out of sync with each other — same reasoning as addMovie.js's extractMetadata.
function extractMetadataFromAudnexus(details) {
  return {
    title: details.title,
    subtitle: details.subtitle || null,
    authors: JSON.stringify((details.authors || []).map((a) => a.name)),
    narrators: JSON.stringify((details.narrators || []).map((n) => n.name)),
    series: details.seriesPrimary?.name || null,
    series_sequence: details.seriesPrimary?.position != null ? String(details.seriesPrimary.position) : null,
    description: stripHtml(details.summary),
    genres: JSON.stringify((details.genres || []).filter((g) => g.type === 'genre').map((g) => g.name)),
    release_date: details.releaseDate ? details.releaseDate.slice(0, 10) : null,
    year: details.releaseDate ? parseInt(details.releaseDate.slice(0, 4), 10) : null,
    runtime_minutes: details.runtimeLengthMin || null,
    publisher: details.publisherName || null,
    language: details.language || null,
    // Audnexus gives a plain numeric-string rating with no accompanying
    // rating-count field (unlike TMDB's vote_average/vote_count pair).
    rating: details.rating != null && !Number.isNaN(Number(details.rating)) ? Number(details.rating) : null,
    abridged: details.formatType === 'abridged' ? 1 : 0,
  };
}

// Apple's catalog is much thinner than Audnexus's — no narrator, no
// series, no runtime, no rating — so those fields just stay null for a
// book added from this source. Still enough for a usable entry (title,
// author, cover, description, genre, year), and better than nothing for a
// book Audible's own catalog doesn't have.
function extractMetadataFromApple(details) {
  return {
    title: apple.cleanCollectionName(details.collectionName),
    subtitle: null,
    authors: JSON.stringify(details.artistName ? [details.artistName] : []),
    narrators: JSON.stringify([]),
    series: null,
    series_sequence: null,
    description: stripHtml(details.description),
    genres: JSON.stringify(details.primaryGenreName ? [details.primaryGenreName] : []),
    release_date: details.releaseDate ? details.releaseDate.slice(0, 10) : null,
    year: details.releaseDate ? parseInt(details.releaseDate.slice(0, 4), 10) : null,
    runtime_minutes: null,
    publisher: details.copyright || null,
    language: null,
    rating: null,
    abridged: /\(abridged\)/i.test(details.collectionName || '') ? 1 : 0,
  };
}

async function fetchAndExtract(source, externalId) {
  if (source === 'apple') {
    const details = await apple.getAudiobookById(externalId);
    return {
      meta: extractMetadataFromApple(details),
      coverUrl: apple.upsizeArtwork(details.artworkUrl100),
      resolvedId: String(details.collectionId),
    };
  }
  const details = await audible.getAudiobookByAsin(externalId);
  return {
    meta: extractMetadataFromAudnexus(details),
    coverUrl: details.image || null,
    resolvedId: details.asin || externalId,
  };
}

const INSERT_SQL = `INSERT INTO audiobooks
  (asin, metadata_source, title, subtitle, authors, narrators, series, series_sequence, description, genres,
   release_date, year, runtime_minutes, publisher, language, rating, abridged,
   cover_file, file_path, file_parts, source_format)
  VALUES (@asin,@metadata_source,@title,@subtitle,@authors,@narrators,@series,@series_sequence,@description,@genres,
   @release_date,@year,@runtime_minutes,@publisher,@language,@rating,@abridged,
   @cover_file,@file_path,@file_parts,@source_format)`;

async function addAudiobookFromExternalId(source, externalId, { filePath = null, fileParts = null, sourceFormat = null } = {}) {
  const { meta, coverUrl, resolvedId } = await fetchAndExtract(source, externalId);
  const coverFile = coverUrl ? await cacheImageFromUrl(DATA_DIR, coverUrl) : null;

  const info = db.prepare(INSERT_SQL).run({
    ...meta,
    asin: resolvedId,
    metadata_source: source,
    cover_file: coverFile,
    file_path: filePath,
    file_parts: fileParts ? JSON.stringify(fileParts) : null,
    source_format: sourceFormat,
  });
  const row = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(info.lastInsertRowid);
  notifications.addNotification('audiobook', row.id, row.title);
  return row;
}

// Deliberately leaves cover_file untouched, same rationale as
// refreshMovieMetadata: a custom cover shouldn't be silently overwritten
// by a metadata refresh.
async function refreshAudiobookMetadata(audiobookId, source, externalId) {
  const { meta } = await fetchAndExtract(source, externalId);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE audiobooks SET ${setClause} WHERE id = @id`).run({ ...meta, id: audiobookId });
  return db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(audiobookId);
}

module.exports = {
  addAudiobookFromExternalId, refreshAudiobookMetadata,
  extractMetadataFromAudnexus, extractMetadataFromApple, stripHtml,
};
