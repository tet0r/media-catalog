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

      await runScan();
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
