const fs = require('fs');
const path = require('path');

async function cachePoster(dataDir, tmdbImagePath) {
  if (!tmdbImagePath) return null;
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const filename = tmdbImagePath.replace(/^\//, '');
  const dest = path.join(postersDir, filename);
  if (fs.existsSync(dest)) return filename;
  try {
    const url = `https://image.tmdb.org/t/p/w500${tmdbImagePath}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return filename;
  } catch {
    return null;
  }
}

module.exports = { cachePoster };
