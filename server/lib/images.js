const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Every cache* helper below normally treats an already-cached file as "done"
// and leaves it alone. `force` is for the "Refetch All Images" action, which
// exists precisely to replace what's on disk: it always re-downloads/copies,
// and only replaces the existing file once the new bytes are known to be a
// real image — a failed or garbage response must never clobber a good cover.

// Written to a temp name first and renamed over the old file, so a crash or
// full disk mid-write can't leave a half-written image under the real name.
function writeFileAtomic(dest, buffer) {
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, buffer);
  try {
    fs.renameSync(tmp, dest);
  } catch {
    // Some Windows setups refuse to rename over an existing file that's
    // open elsewhere — fall back to overwriting in place.
    fs.copyFileSync(tmp, dest);
    fs.unlinkSync(tmp);
  }
}

function assertLooksLikeImage(contentType, buffer) {
  if (!buffer.length) throw new Error('Image response was empty');
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Expected an image but got ${contentType}`);
  }
}

async function cachePoster(dataDir, tmdbImagePath, { force = false } = {}) {
  if (!tmdbImagePath) return null;
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const filename = tmdbImagePath.replace(/^\//, '');
  const dest = path.join(postersDir, filename);
  if (!force && fs.existsSync(dest)) return filename;
  try {
    const url = `https://image.tmdb.org/t/p/w500${tmdbImagePath}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (force) {
      assertLooksLikeImage(res.headers.get('content-type') || '', buf);
      writeFileAtomic(dest, buf);
    } else {
      fs.writeFileSync(dest, buf);
    }
    return filename;
  } catch {
    return null;
  }
}

// For a user-picked image from an arbitrary source (ThePosterDB, a TMDB
// backdrop alternative, ...) rather than TMDB's own primary poster/backdrop
// path. Named by a hash of the URL so re-picking the same image is a no-op.
async function cacheImageFromUrl(dataDir, imageUrl, { force = false } = {}) {
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const hash = crypto.createHash('sha1').update(imageUrl).digest('hex');
  const filename = `custom-${hash}.${ext}`;
  const dest = path.join(postersDir, filename);
  if (force || !fs.existsSync(dest)) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (force) {
      assertLooksLikeImage(contentType, buf);
      writeFileAtomic(dest, buf);
    } else {
      fs.writeFileSync(dest, buf);
    }
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

// For an image that's already a local file readable by this process (e.g.
// LaunchBox's own cached box art on a mounted network share) rather than
// something fetched over HTTP. Named by a hash of the source path, same
// no-op-on-repeat rationale as the other cache* helpers.
function cacheImageFromLocalFile(dataDir, srcPath, { force = false } = {}) {
  const postersDir = path.join(dataDir, 'posters');
  fs.mkdirSync(postersDir, { recursive: true });
  const ext = path.extname(srcPath).replace('.', '').toLowerCase() || 'jpg';
  const hash = crypto.createHash('sha1').update(srcPath).digest('hex');
  const filename = `custom-${hash}.${ext}`;
  const dest = path.join(postersDir, filename);
  if (force || !fs.existsSync(dest)) {
    if (force) writeFileAtomic(dest, fs.readFileSync(srcPath));
    else fs.copyFileSync(srcPath, dest);
  }
  return filename;
}

module.exports = { cachePoster, cacheImageFromUrl, cacheImageBuffer, cacheImageFromLocalFile };
