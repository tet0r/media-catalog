const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Images live under the posters folder, sorted into a folder per media type
// and kind of image (Movies/Posters, Movies/Backdrops, Games/Covers, ...).
// Every cache* helper takes a `folder` option from this list and writes the
// file straight into it, returning the path relative to the posters folder
// ('Movies/Posters/abc.jpg') — that relative path is what's stored in the
// database and, after /posters/, in the image's URL. lib/imageNames.js later
// renames the file after the item it belongs to, and moves anything that's in
// the wrong place (or from before the folders existed) where it belongs.
const IMAGE_FOLDERS = {
  moviePoster: 'Movies/Posters',
  movieBackdrop: 'Movies/Backdrops',
  movieCollection: 'Movies/Collections',
  tvPoster: 'TV Shows/Posters',
  tvBackdrop: 'TV Shows/Backdrops',
  audiobook: 'Audiobooks/Covers',
  ebook: 'Ebooks/Covers',
  comic: 'Comics/Covers',
  album: 'Music/Covers',
  vinyl: 'Vinyl/Covers',
  game: 'Games/Covers',
};

// The picture chosen for a group card (an author, a series, an artist, a
// platform, a store) goes next to its library's covers.
const GROUP_FOLDERS = {
  audiobook: 'Audiobooks/Groups',
  ebook: 'Ebooks/Groups',
  comic: 'Comics/Groups',
  album: 'Music/Groups',
  vinyl: 'Vinyl/Groups',
  game: 'Games/Groups',
};

function groupImageFolder(mediaType) {
  return GROUP_FOLDERS[String(mediaType || '').split('_')[0]] || 'Groups';
}

// Where an image goes: creates the folder, and returns both the relative
// path to store and the full path to write to.
function placeImage(dataDir, folder, filename) {
  const dir = path.join(dataDir, 'posters', ...(folder ? folder.split('/') : []));
  fs.mkdirSync(dir, { recursive: true });
  return { rel: folder ? `${folder}/${filename}` : filename, dest: path.join(dir, filename) };
}

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

async function cachePoster(dataDir, tmdbImagePath, { force = false, folder = '' } = {}) {
  if (!tmdbImagePath) return null;
  const { rel: filename, dest } = placeImage(dataDir, folder, tmdbImagePath.replace(/^\//, ''));
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
async function cacheImageFromUrl(dataDir, imageUrl, { force = false, folder = '' } = {}) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const hash = crypto.createHash('sha1').update(imageUrl).digest('hex');
  const { rel: filename, dest } = placeImage(dataDir, folder, `custom-${hash}.${ext}`);
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
async function cacheImageBuffer(dataDir, buffer, contentType, { folder = '' } = {}) {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg';
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  const { rel: filename, dest } = placeImage(dataDir, folder, `custom-${hash}.${ext}`);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
  return filename;
}

// For an image that's already a local file readable by this process (e.g.
// LaunchBox's own cached box art on a mounted network share) rather than
// something fetched over HTTP. Named by a hash of the source path, same
// no-op-on-repeat rationale as the other cache* helpers.
function cacheImageFromLocalFile(dataDir, srcPath, { force = false, folder = '' } = {}) {
  const ext = path.extname(srcPath).replace('.', '').toLowerCase() || 'jpg';
  const hash = crypto.createHash('sha1').update(srcPath).digest('hex');
  const { rel: filename, dest } = placeImage(dataDir, folder, `custom-${hash}.${ext}`);
  if (force || !fs.existsSync(dest)) {
    if (force) writeFileAtomic(dest, fs.readFileSync(srcPath));
    else fs.copyFileSync(srcPath, dest);
  }
  return filename;
}

module.exports = { cachePoster, cacheImageFromUrl, cacheImageBuffer, cacheImageFromLocalFile, IMAGE_FOLDERS, groupImageFolder };
