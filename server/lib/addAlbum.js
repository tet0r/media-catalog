const db = require('../db');
const musicbrainz = require('./musicbrainz');
const lastfm = require('./lastfm');
const path = require('path');
const { cacheImageFromUrl } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

async function fetchDetails(source, externalId) {
  if (source === 'lastfm') return lastfm.getAlbumDetails(db, externalId);
  return musicbrainz.getAlbumDetails(externalId);
}

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
  (external_id, metadata_source, title, artist, year, genres, tracks, cover_file, file_path, disc_paths)
  VALUES (@external_id,@metadata_source,@title,@artist,@year,@genres,@tracks,@cover_file,@file_path,@disc_paths)`;

async function addAlbumFromExternalId(source, externalId, { filePath = null, discPaths = null } = {}) {
  const details = await fetchDetails(source, externalId);

  // Unlike TMDB/Audible/Open Library, a cover URL here (MusicBrainz's
  // Cover Art Archive, or Last.fm's own artwork) may 404 or be missing —
  // most release-groups in a personal collection won't have archived art
  // on either source — that's normal, not a failure worth aborting the
  // add over.
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
    metadata_source: source,
    cover_file: coverFile,
    file_path: filePath,
    disc_paths: JSON.stringify(discPaths && discPaths.length ? discPaths : [filePath]),
  });
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid);
}

// Deliberately leaves cover_file untouched, same rationale as
// refreshMovieMetadata/refreshAudiobookMetadata/refreshEbookMetadata: a
// custom cover shouldn't be silently overwritten by a metadata refresh.
async function refreshAlbumMetadata(albumId, source, externalId) {
  const details = await fetchDetails(source, externalId);
  const meta = extractMetadata(details);
  const setClause = Object.keys(meta).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE albums SET ${setClause} WHERE id = @id`).run({ ...meta, id: albumId });
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
}

// Unlike refreshAlbumMetadata (re-fetches from the SAME external_id, so
// keeping the existing cover makes sense), this points an existing album
// at a DIFFERENT catalog entry entirely — picked from a fresh search on
// the album's own detail page, for when the original match was wrong. The
// cover is replaced too, since the old one belongs to whatever the album
// was previously matched to, not the new pick. file_path/disc_paths are
// left alone: it's still the same folder(s) on disk, just re-pointed at
// different metadata.
async function rematchAlbum(albumId, source, externalId) {
  const details = await fetchDetails(source, externalId);

  let coverFile = null;
  if (details.cover_url) {
    try {
      coverFile = await cacheImageFromUrl(DATA_DIR, details.cover_url);
    } catch {
      coverFile = null;
    }
  }

  const meta = extractMetadata(details);
  const fields = { ...meta, external_id: externalId, metadata_source: source, cover_file: coverFile };
  const setClause = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE albums SET ${setClause} WHERE id = @id`).run({ ...fields, id: albumId });
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
}

module.exports = { addAlbumFromExternalId, refreshAlbumMetadata, rematchAlbum, extractMetadata };
