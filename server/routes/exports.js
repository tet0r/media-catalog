const express = require('express');
const fs = require('fs');
const db = require('../db');
const exportLib = require('../lib/export');

const router = express.Router();

router.get('/text', (req, res) => {
  res.json(exportLib.listTextExports());
});

router.get('/text/status', (req, res) => {
  res.json(db.prepare("SELECT * FROM export_status WHERE type = 'text'").get());
});

router.post('/text', (req, res) => {
  const status = db.prepare("SELECT running FROM export_status WHERE type = 'text'").get();
  if (status.running) return res.status(409).json({ error: 'A text export is already running' });
  exportLib.runTextExport();
  res.status(202).json({ started: true });
});

router.get('/text/:filename/download', (req, res) => {
  try {
    const full = exportLib.safeTextExportPath(req.params.filename);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
    res.download(full);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/text/:filename', (req, res) => {
  try {
    exportLib.deleteTextExport(req.params.filename);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/html', (req, res) => {
  res.json(exportLib.listHtmlExports());
});

router.get('/html/status', (req, res) => {
  res.json(db.prepare("SELECT * FROM export_status WHERE type = 'html'").get());
});

router.post('/html', (req, res) => {
  const status = db.prepare("SELECT running FROM export_status WHERE type = 'html'").get();
  if (status.running) return res.status(409).json({ error: 'An HTML export is already running' });
  exportLib.runHtmlExport();
  res.status(202).json({ started: true });
});

// Zipped on the fly rather than pre-zipped at export time — the export
// itself stays a plain, directly-browsable folder (consistent with how
// backups are a plain file, no archive step of its own), and a zip is
// only ever needed for the one-click "take this with me" download.
router.get('/html/:name/download', (req, res) => {
  try {
    exportLib.streamHtmlExportZip(req.params.name, res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/html/:name', (req, res) => {
  try {
    exportLib.deleteHtmlExport(req.params.name);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
