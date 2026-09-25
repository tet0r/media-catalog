const db = require('../db');
const { refreshTvShowMetadata } = require('./addTvShow');

// In-memory, not persisted — same rationale as bulkRefresh.js (Movies):
// an occasional maintenance action, not something that needs to survive a
// restart. Re-running it after an interrupted run is harmless.
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const shows = db.prepare('SELECT id, tvdb_id FROM tv_shows WHERE tvdb_id IS NOT NULL').all();
  status = { running: true, total: shows.length, done: 0, failed: 0, message: `Refreshing ${shows.length} shows...` };

  for (const show of shows) {
    try {
      await refreshTvShowMetadata(show.id, show.tvdb_id);
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
