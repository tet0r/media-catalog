const db = require('../db');
const { refreshAlbumMetadata } = require('./addAlbum');

// Same in-memory, non-persisted status as bulkRefresh.js/bulkRefreshAudiobooks.js/
// bulkRefreshEbooks.js. Slower than those, unavoidably — every refresh here
// makes 2-3 sequential MusicBrainz requests, each throttled to 1/second.
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const albums = db.prepare('SELECT id, external_id, metadata_source FROM albums WHERE external_id IS NOT NULL').all();
  status = {
    running: true, total: albums.length, done: 0, failed: 0,
    message: `Refreshing ${albums.length} albums (MusicBrainz is rate-limited to 1 request/second, so this will take a while)...`,
  };

  for (const album of albums) {
    try {
      await refreshAlbumMetadata(album.id, album.metadata_source || 'musicbrainz', album.external_id);
      status.done++;
    } catch {
      status.failed++;
    }
    status.message = `Refreshed ${status.done + status.failed} of ${status.total}...`;
  }

  status.running = false;
  status.message = `Done — ${status.done} refreshed${status.failed ? `, ${status.failed} failed` : ''}.`;
}

function startBulkRefresh() {
  if (status.running) return false;
  runBulkRefresh();
  return true;
}

function getStatus() {
  return status;
}

module.exports = { startBulkRefresh, getStatus };
