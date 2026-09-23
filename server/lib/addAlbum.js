const db = require('../db');
const musicbrainz = require('./musicbrainz');
const path = require('path');
const { cacheImageFromUrl } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Shared by both a fresh add and a metadata refresh, same reasoning as
// addAudiobook.js's extractMetadataFromAudnexus.
function extractMetadata(details) {
  return {
    title: details.title,
    artist: details.artist,
    year: details.year,
    genres: JSON.stringify(details.genres || []),
    tracks: JSON.stringify(details.tracks || []),
  };
}

const INSERT_SQL = `INSERT INTO albums
  (external_id, title, artist, year, genres, tracks, cover_file, file_path)
  VALUES (@external_id,@title,@artist,@year,@genres,@tracks,@cover_file,@file_path)`;

async function addAlbumFromExternalId(externalId, { filePath = null } = {}) {
  const details = await musicbrainz.getAlbumDetails(externalId);

  // Unlike TMDB/Audible/Open Library, MusicBrainz's Cover Art Archive URL
  // is a guess that may 404 (most release-groups in a personal collection
  // won't have archived art) — that's normal, not a failure worth
  // aborting the add over.
  let coverFile = null;
  if (details.cover_url) {
    try {
      coverFile = await cacheImageFromUrl(DATA_DIR, details.cover_url);
    } catch {
      coverFile = null;
    }
  }

  const info = db.prepare(INSERT_SQL).run({
    ...extractMetadata(details),
    external_id: externalId,
    cover_file: coverFile,
    file_path: filePath,
  });
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid);
}

// Deliberately leaves cover_file untouched, same rationale as
// refreshMovieMetadata/refreshAudiobookMetadata/refreshEbookMetadata: a
// custom cover shouldn't be silently overwritten by a metadata refresh.
async function refreshAlbumMetadata(albumId, externalId) {
  const details = await musicbrainz.getAlbumDetails(externalId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE albums SET ${setClause} WHERE id = @id`).run({ ...meta, id: albumId });
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
}

module.exports = { addAlbumFromExternalId, refreshAlbumMetadata, extractMetadata };
