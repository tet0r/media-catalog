const db = require('../db');
const { refreshEbookMetadata } = require('./addEbook');

// Same in-memory, non-persisted status as bulkRefresh.js/bulkRefreshAudiobooks.js.
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const ebooks = db.prepare('SELECT id, external_id FROM ebooks WHERE external_id IS NOT NULL').all();
  status = { running: true, total: ebooks.length, done: 0, failed: 0, message: `Refreshing ${ebooks.length} ebooks...` };

  for (const book of ebooks) {
    try {
      await refreshEbookMetadata(book.id, book.external_id);
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
