const db = require('../db');
const { refreshComicMetadata } = require('./addComic');

// Same in-memory, non-persisted status as bulkRefresh.js/bulkRefreshEbooks.js.
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const comics = db.prepare('SELECT id, metadata_source, external_id FROM comics WHERE external_id IS NOT NULL').all();
  status = { running: true, total: comics.length, done: 0, failed: 0, message: `Refreshing ${comics.length} comics...` };

  for (const comic of comics) {
    try {
      await refreshComicMetadata(comic.id, comic.metadata_source, comic.external_id);
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
