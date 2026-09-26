const db = require('../db');
const openlibrary = require('./openlibrary');
const path = require('path');
const { cacheImageFromUrl } = require('./images');
const notifications = require('./notifications');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Shared by both a fresh add and a metadata refresh, same reasoning as
// addAudiobook.js's extractMetadataFromAudnexus.
function extractMetadata(details) {
  return {
    title: details.title,
    authors: JSON.stringify(details.authors || []),
    description: details.description || null,
    genres: JSON.stringify(details.genres || []),
    year: details.year || null,
    publisher: details.publisher || null,
    language: details.language || null,
    page_count: details.page_count || null,
    isbn: details.isbn || null,
  };
}

const INSERT_SQL = `INSERT INTO ebooks
  (external_id, title, authors, description, genres, year, publisher, language, page_count, isbn,
   cover_file, file_path, file_format)
  VALUES (@external_id,@title,@authors,@description,@genres,@year,@publisher,@language,@page_count,@isbn,
   @cover_file,@file_path,@file_format)`;

async function addEbookFromExternalId(externalId, { filePath = null, fileFormat = null } = {}) {
  const details = await openlibrary.getBookByKey(externalId);
  const coverFile = details.cover_url ? await cacheImageFromUrl(DATA_DIR, details.cover_url) : null;

  const info = db.prepare(INSERT_SQL).run({
    ...extractMetadata(details),
    external_id: externalId,
    cover_file: coverFile,
    file_path: filePath,
    file_format: fileFormat,
  });
  const row = db.prepare('SELECT * FROM ebooks WHERE id = ?').get(info.lastInsertRowid);
  notifications.addNotification('ebook', row.id, row.title);
  return row;
}

// Deliberately leaves cover_file untouched, same rationale as
// refreshMovieMetadata/refreshAudiobookMetadata: a custom cover shouldn't be
// silently overwritten by a metadata refresh.
async function refreshEbookMetadata(ebookId, externalId) {
  const details = await openlibrary.getBookByKey(externalId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE ebooks SET ${setClause} WHERE id = @id`).run({ ...meta, id: ebookId });
  return db.prepare('SELECT * FROM ebooks WHERE id = ?').get(ebookId);
}

// Unlike refreshEbookMetadata (re-fetches from the SAME external_id, so
// keeping the existing cover makes sense), this points an existing ebook
// at a DIFFERENT Open Library work entirely — picked from a fresh search
// on the ebook's own detail page, for when the original match was wrong.
// The cover is replaced too, since the old one belongs to whatever the
// ebook was previously matched to. file_path/file_format are left alone:
// it's still the same file on disk, just re-pointed at different metadata.
async function rematchEbook(ebookId, externalId) {
  const details = await openlibrary.getBookByKey(externalId);
  const coverFile = details.cover_url ? await cacheImageFromUrl(DATA_DIR, details.cover_url) : null;
  const meta = extractMetadata(details);
  const fields = { ...meta, external_id: externalId, cover_file: coverFile };
  const setClause = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE ebooks SET ${setClause} WHERE id = @id`).run({ ...fields, id: ebookId });
  return db.prepare('SELECT * FROM ebooks WHERE id = ?').get(ebookId);
}

module.exports = { addEbookFromExternalId, refreshEbookMetadata, rematchEbook, extractMetadata };
