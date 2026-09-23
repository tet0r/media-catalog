const express = require('express');
const path = require('path');
const fs = require('fs');
const { readCurrentVersion } = require('./lib/version');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const VERSION = readCurrentVersion();

app.use(express.json());

app.use('/posters', express.static(path.join(DATA_DIR, 'posters')));

const scanRouter = require('./routes/scan');
const audiobookScanRouter = require('./routes/audiobookScan');
const ebookScanRouter = require('./routes/ebookScan');
const albumScanRouter = require('./routes/albumScan');
const { runSync: runVinylSync } = require('./lib/vinylSync');

app.use('/api/movies', require('./routes/movies'));
app.use('/api/audiobooks', require('./routes/audiobooks'));
app.use('/api/ebooks', require('./routes/ebooks'));
app.use('/api/albums', require('./routes/albums'));
app.use('/api/vinyl', require('./routes/vinyl'));
app.use('/api/search', require('./routes/search'));
app.use('/api/scan', scanRouter);
app.use('/api/audiobook-scan', audiobookScanRouter);
app.use('/api/ebook-scan', ebookScanRouter);
app.use('/api/album-scan', albumScanRouter);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/images', require('./routes/images'));
app.use('/api/version-check', require('./routes/version'));

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

require('./lib/autoScanScheduler').start([
  {
    runScan: scanRouter.runScan,
    enabledKey: 'auto_scan_enabled',
    intervalKey: 'auto_scan_interval_minutes',
    statusTable: 'scan_status',
  },
  {
    runScan: audiobookScanRouter.runScan,
    enabledKey: 'audiobook_auto_scan_enabled',
    intervalKey: 'audiobook_auto_scan_interval_minutes',
    statusTable: 'audiobook_scan_status',
  },
  {
    runScan: ebookScanRouter.runScan,
    enabledKey: 'ebook_auto_scan_enabled',
    intervalKey: 'ebook_auto_scan_interval_minutes',
    statusTable: 'ebook_scan_status',
  },
  {
    runScan: albumScanRouter.runScan,
    enabledKey: 'album_auto_scan_enabled',
    intervalKey: 'album_auto_scan_interval_minutes',
    statusTable: 'album_scan_status',
  },
  {
    runScan: runVinylSync,
    enabledKey: 'vinyl_auto_sync_enabled',
    intervalKey: 'vinyl_auto_sync_interval_minutes',
    statusTable: 'vinyl_sync_status',
  },
]);

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/posters')) return res.status(404).end();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Media Catalog listening on port ${PORT}`);
});
