const db = require('../db');
const comicSources = require('./comicSources');
const path = require('path');
const { cacheImageFromUrl } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Shared by both a fresh add and a metadata refresh, same reasoning as
// addEbook.js's extractMetadata.
function extractMetadata(details) {
  return {
    series: details.series,
    issue_number: details.issue_number,
    title: details.title,
    description: details.description,
    publisher: details.publisher,
    creators: JSON.stringify(details.creators || []),
    cover_date: details.cover_date,
    year: details.year,
  };
}

const INSERT_SQL = `INSERT INTO comics
  (external_id, metadata_source, series, issue_number, title, description, publisher, creators, cover_date, year,
   cover_file, file_path, format)
  VALUES (@external_id,@metadata_source,@series,@issue_number,@title,@description,@publisher,@creators,@cover_date,@year,
   @cover_file,@file_path,@format)`;

async function fetchCoverFile(coverUrl) {
  if (!coverUrl) return null;
  // Unlike ComicVine/Metron's CDNs, GCD's cover images 403 a plain fetch
  // without a matching Referer — same "a cover may just not be fetchable"
  // situation as MusicBrainz/Last.fm's occasionally-missing artwork, so
  // this is non-fatal (a missing cover, not an aborted add) rather than a
  // thrown error.
  try {
    return await cacheImageFromUrl(DATA_DIR, coverUrl);
  } catch {
    return null;
  }
}

async function addComicFromExternalId(source, externalId, { filePath = null, format = null } = {}) {
  const details = await comicSources.getIssueDetails(db, source, externalId);
  const coverFile = await fetchCoverFile(details.cover_url);

  const info = db.prepare(INSERT_SQL).run({
    ...extractMetadata(details),
    external_id: String(details.id),
    metadata_source: source,
    cover_file: coverFile,
    file_path: filePath,
    format,
  });
  const row = db.prepare('SELECT * FROM comics WHERE id = ?').get(info.lastInsertRowid);
  notifications.addNotification('comic', row.id, row.title);
  return row;
}

// Deliberately leaves cover_file untouched, same rationale as
// refreshEbookMetadata/refreshMovieMetadata: a custom cover shouldn't be
// silently overwritten by a metadata refresh.
async function refreshComicMetadata(comicId, source, externalId) {
  const details = await comicSources.getIssueDetails(db, source, externalId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE comics SET ${setClause} WHERE id = @id`).run({ ...meta, id: comicId });
  return db.prepare('SELECT * FROM comics WHERE id = ?').get(comicId);
}

// Unlike refreshComicMetadata (re-fetches from the SAME issue id, so
// keeping the existing cover makes sense), this points an existing comic
// at a DIFFERENT issue entirely — possibly from a different source than it
// was originally matched with — picked from a fresh search on the comic's
// own detail page, for when the original match was wrong. The cover is
// replaced too, since the old one belongs to whatever the comic was
// previously matched to. file_path/format are left alone: it's still the
// same file on disk, just re-pointed at different metadata.
async function rematchComic(comicId, source, externalId) {
  const details = await comicSources.getIssueDetails(db, source, externalId);
  const coverFile = await fetchCoverFile(details.cover_url);
  const meta = extractMetadata(details);
  const fields = { ...meta, external_id: String(details.id), metadata_source: source, cover_file: coverFile };
  const setClause = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE comics SET ${setClause} WHERE id = @id`).run({ ...fields, id: comicId });
  return db.prepare('SELECT * FROM comics WHERE id = ?').get(comicId);
}

module.exports = { addComicFromExternalId, refreshComicMetadata, rematchComic, extractMetadata };
