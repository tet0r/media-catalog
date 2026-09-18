const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

// For a user-picked image from an arbitrary source (ThePosterDB, a TMDB
// backdrop alternative, ...) rather than TMDB's own primary poster/backdrop
// path. Named by a hash of the URL so re-picking the same image is a no-op.
async function cacheImageFromUrl(dataDir, imageUrl) {
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const hash = crypto.createHash('sha1').update(imageUrl).digest('hex');
  const filename = `custom-${hash}.${ext}`;
  const dest = path.join(postersDir, filename);
  if (!fs.existsSync(dest)) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  }
  return filename;
}

// For a directly-uploaded file rather than a fetched URL. Named by a hash of
// the bytes so re-uploading the exact same file is a no-op, same as cacheImageFromUrl.
async function cacheImageBuffer(dataDir, buffer, contentType) {
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  const filename = `custom-${hash}.${ext}`;
  const dest = path.join(postersDir, filename);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
  return filename;
}

module.exports = { cachePoster, cacheImageFromUrl, cacheImageBuffer };
