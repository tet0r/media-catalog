const db = require('../db');
const { refreshMovieMetadata } = require('./addMovie');

// In-memory, not persisted — this is an occasional maintenance action, not
// something that needs to survive a server restart the way scan_status
// does. If the app restarts mid-refresh, it just stops; re-running it is
// harmless (each movie is independently idempotent).
let status = { running: false, total: 0, done: 0, failed: 0, message: 'Idle' };

async function runBulkRefresh() {
  const movies = db.prepare('SELECT id, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all();
  status = { running: true, total: movies.length, done: 0, failed: 0, message: `Refreshing ${movies.length} movies...` };

  for (const movie of movies) {
    try {
      await refreshMovieMetadata(movie.id, movie.tmdb_id);
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
