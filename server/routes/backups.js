const express = require('express');
const fs = require('fs');
const db = require('../db');
const backup = require('../lib/backup');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(backup.listBackups());
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM backup_status WHERE id = 1').get());
});

router.post('/', (req, res) => {
  const status = db.prepare('SELECT running FROM backup_status WHERE id = 1').get();
  if (status.running) return res.status(409).json({ error: 'A backup is already running' });
  backup.runBackup();
  res.status(202).json({ started: true });
});

router.get('/:filename/download', (req, res) => {
  try {
    const full = backup.safeBackupPath(req.params.filename);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
    res.download(full);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:filename', (req, res) => {
  try {
    backup.deleteBackup(req.params.filename);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restoring closes this process's only database connection (see
// lib/backup.js), so nothing else in this process can serve another
// request correctly afterward — the response has to go out first, then
// the process exits and relies on the platform's restart policy
// (docker-compose's `restart: unless-stopped`) to come back up fresh.
router.post('/:filename/restore', async (req, res) => {
  try {
    await backup.restoreBackup(req.params.filename);
    res.json({ ok: true, restarting: true });
    setTimeout(() => process.exit(0), 300);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
