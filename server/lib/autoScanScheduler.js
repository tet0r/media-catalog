const db = require('../db');

// Checks every minute whether a scan is due, rather than reconfiguring a
// timer whenever the setting changes — simpler, and "due" just means
// enough time has passed since scan_status.last_run (which any scan,
// manual or automatic, already updates).
const CHECK_INTERVAL_MS = 60 * 1000;

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

async function tick(runScan) {
  try {
    if (getSetting('auto_scan_enabled') !== 'true') return;

    const intervalMinutes = Number(getSetting('auto_scan_interval_minutes')) || 60;
    const status = db.prepare('SELECT running, last_run FROM scan_status WHERE id = 1').get();
    if (status.running) return;

    const lastRun = status.last_run ? new Date(status.last_run).getTime() : 0;
    if (Date.now() - lastRun < intervalMinutes * 60 * 1000) return;

    await runScan();
  } catch (err) {
    console.error('Auto-scan check failed:', err);
  }
}

function start(runScan) {
  setInterval(() => tick(runScan), CHECK_INTERVAL_MS);
}

module.exports = { start, tick };
