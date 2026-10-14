const express = require('express');
const db = require('../db');
const imageBackup = require('../lib/imageBackup');

const router = express.Router();

function isRunning() {
  return !!db.prepare('SELECT running FROM image_backup_status WHERE id = 1').get().running;
}

router.get('/', (req, res) => {
  res.json(imageBackup.getImageBackupInfo());
});

router.get('/status', (req, res) => {
  res.json(db.prepare('SELECT * FROM image_backup_status WHERE id = 1').get());
});

// A backup and a restore share one status row, so only one of them can run
// at a time — a restore that started while a backup was copying the other
// way would just be two jobs undoing each other's work.
router.post('/', (req, res) => {
  if (isRunning()) return res.status(409).json({ error: 'An image backup or restore is already running' });
  imageBackup.runImageBackup();
  res.status(202).json({ started: true });
});

router.post('/restore', (req, res) => {
  if (isRunning()) return res.status(409).json({ error: 'An image backup or restore is already running' });
  imageBackup.runImageRestore();
  res.status(202).json({ started: true });
});

module.exports = router;
