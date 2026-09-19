const db = require('../db');
const { refreshAudiobookMetadata } = require('./addAudiobook');

// Same in-memory, non-persisted status as bulkRefresh.js (movies) — this is
// an occasional maintenance action, not something that needs to survive a
// restart.
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const audiobooks = db.prepare("SELECT id, asin, metadata_source FROM audiobooks WHERE asin IS NOT NULL").all();
  status = { running: true, total: audiobooks.length, done: 0, failed: 0, message: `Refreshing ${audiobooks.length} audiobooks...` };

  for (const book of audiobooks) {
    try {
      await refreshAudiobookMetadata(book.id, book.metadata_source || 'audible', book.asin);
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
