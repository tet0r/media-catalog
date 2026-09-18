const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// The Docker image copies VERSION next to this file; running from source
// (no Docker) it's one level up, at the repo root.
function readVersion() {
  for (const p of [path.join(__dirname, 'VERSION'), path.join(__dirname, '..', 'VERSION')]) {
    try {
      return fs.readFileSync(p, 'utf-8').trim();
    } catch {
      // try the next candidate
    }
  }
  return 'unknown';
}
const VERSION = readVersion();

app.use(express.json());

app.use('/posters', express.static(path.join(DATA_DIR, 'posters')));

const scanRouter = require('./routes/scan');

app.use('/api/movies', require('./routes/movies'));
app.use('/api/search', require('./routes/search'));
app.use('/api/scan', scanRouter);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/images', require('./routes/images'));

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

require('./lib/autoScanScheduler').start(scanRouter.runScan);

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/posters')) return res.status(404).end();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Movie cataloger listening on port ${PORT}`);
});
