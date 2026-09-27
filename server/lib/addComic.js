const db = require('../db');
const comicvine = require('./comicvine');
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
  (comicvine_issue_id, series, issue_number, title, description, publisher, creators, cover_date, year,
   cover_file, file_path, format)
  VALUES (@comicvine_issue_id,@series,@issue_number,@title,@description,@publisher,@creators,@cover_date,@year,
   @cover_file,@file_path,@format)`;

async function addComicFromIssueId(issueId, { filePath = null, format = null } = {}) {
  const details = await comicvine.getIssueDetails(db, issueId);
  const coverFile = details.cover_url ? await cacheImageFromUrl(DATA_DIR, details.cover_url) : null;

  const info = db.prepare(INSERT_SQL).run({
    ...extractMetadata(details),
    comicvine_issue_id: details.id,
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
async function refreshComicMetadata(comicId, issueId) {
  const details = await comicvine.getIssueDetails(db, issueId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE comics SET ${setClause} WHERE id = @id`).run({ ...meta, id: comicId });
  return db.prepare('SELECT * FROM comics WHERE id = ?').get(comicId);
}

// Unlike refreshComicMetadata (re-fetches from the SAME issue id, so
// keeping the existing cover makes sense), this points an existing comic
// at a DIFFERENT ComicVine issue entirely — picked from a fresh search on
// the comic's own detail page, for when the original match was wrong. The
// cover is replaced too, since the old one belongs to whatever the comic
// was previously matched to. file_path/format are left alone: it's still
// the same file on disk, just re-pointed at different metadata.
async function rematchComic(comicId, issueId) {
  const details = await comicvine.getIssueDetails(db, issueId);
  const coverFile = details.cover_url ? await cacheImageFromUrl(DATA_DIR, details.cover_url) : null;
  const meta = extractMetadata(details);
  const fields = { ...meta, comicvine_issue_id: details.id, cover_file: coverFile };
  const setClause = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE comics SET ${setClause} WHERE id = @id`).run({ ...fields, id: comicId });
  return db.prepare('SELECT * FROM comics WHERE id = ?').get(comicId);
}

module.exports = { addComicFromIssueId, refreshComicMetadata, rematchComic, extractMetadata };
