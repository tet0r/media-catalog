const db = require('../db');

// Checks every minute whether a scan is due, rather than reconfiguring a
// timer whenever the setting changes — simpler, and "due" just means
// enough time has passed since <statusTable>.last_run (which any scan,
// manual or automatic, already updates).
const CHECK_INTERVAL_MS = 60 * 1000;

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// One job = one media type's scan: its own enabled/interval settings keys
// and its own status table, so movies and audiobooks (and any future media
// type) run on independent schedules without stepping on each other.
function makeTick({ runScan, enabledKey, intervalKey, statusTable }) {
  return async function tick() {
    try {
      if (getSetting(enabledKey) !== 'true') return;

      const intervalMinutes = Number(getSetting(intervalKey)) || 60;
      const status = db.prepare(`SELECT running, last_run FROM ${statusTable} WHERE id = 1`).get();
      if (status.running) return;

      const lastRun = status.last_run ? new Date(status.last_run).getTime() : 0;
      if (Date.now() - lastRun < intervalMinutes * 60 * 1000) return;

      // Every scan/sync job is told it's running automatically — every
      // media type except Vinyl/Games ignores the extra argument (they
      // already never touch an existing item's metadata, scheduled or
      // not, see routes/scan.js et al.), but Vinyl/Games' own "stay in
      // sync" mirror otherwise updates an already-known record's fields
      // on every run. { manual: false } is what keeps that to manual
      // Sync clicks only — see lib/vinylSync.js and lib/gamesSync.js.
      await runScan({ manual: false });
    } catch (err) {
      console.error(`Auto-scan check failed (${statusTable}):`, err);
    }
  };
}

function start(jobs) {
  const ticks = jobs.map(makeTick);
  setInterval(() => ticks.forEach((tick) => tick()), CHECK_INTERVAL_MS);
}

module.exports = { start };
