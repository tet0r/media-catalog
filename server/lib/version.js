const fs = require('fs');
const path = require('path');

// Docker image: VERSION sits next to index.js (/app/VERSION, this file is
// at /app/lib/version.js). Running from source: VERSION is at the repo
// root, one level further up than that.
function readCurrentVersion() {
  const candidates = [
    path.join(__dirname, '..', 'VERSION'),
    path.join(__dirname, '..', '..', 'VERSION'),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, 'utf-8').trim();
    } catch {
      // try the next candidate
    }
  }
  return 'unknown';
}

// Numeric, dot-separated comparison (not a plain float parse) so "4.10" is
// correctly greater than "4.9" once a minor version reaches double digits.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

const VERSION_CHECK_URL =
  process.env.VERSION_CHECK_URL || 'https://raw.githubusercontent.com/tet0r/movie-cataloger/main/VERSION';
// Short cache, not the hour this originally used — for a single-user
// self-hosted app, fetching one small static file every few minutes is
// nothing GitHub notices, and a long cache meant a push could go
// unnoticed for up to an hour even with the tab open and freshly reloaded.
const CHECK_CACHE_MS = 5 * 60 * 1000;

let latestCache = { checkedAt: 0, value: null };

// Checks the VERSION file on the repo's main branch. A failed check
// (offline, GitHub down, repo renamed) just returns null rather than
// throwing — this is a "nice to know", never something that should break
// the app.
async function getLatestVersion() {
  const now = Date.now();
  if (latestCache.value !== null && now - latestCache.checkedAt < CHECK_CACHE_MS) {
    return latestCache.value;
  }
  try {
    const res = await fetch(VERSION_CHECK_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = (await res.text()).trim();
    latestCache = { checkedAt: now, value: text };
    return text;
  } catch {
    return null;
  }
}

module.exports = { readCurrentVersion, compareVersions, getLatestVersion };
