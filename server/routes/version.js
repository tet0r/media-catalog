const express = require('express');
const { readCurrentVersion, compareVersions, getLatestVersion } = require('../lib/version');

const router = express.Router();
const VERSION = readCurrentVersion();

router.get('/', async (req, res) => {
  const latest = await getLatestVersion();
  const updateAvailable = latest ? compareVersions(latest, VERSION) > 0 : false;
  res.json({ current: VERSION, latest, updateAvailable });
});

module.exports = router;
