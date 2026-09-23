// Reads artist/album straight out of an audio file's own embedded tags
// (ID3v2/v1 for MP3, Vorbis comments for FLAC/OGG, iTunes-style atoms for
// M4A) — same "authoritative metadata beats guessing from a name" idea as
// epubMetadata.js, applied here to a folder's first track instead of
// guessing the album from the folder name.
//
// Only reads a bounded prefix of the file (plus the last 128 bytes for an
// ID3v1 fallback), not the whole thing — audio files can be tens of MB and
// the tags of interest are always near the start (or, for ID3v1, the very
// end), so this avoids loading a large file into memory just to read a few
// KB of metadata. A file whose tags happen to sit beyond that prefix (an
// unusually large embedded cover image, or a non-"fast start" M4A with its
// metadata atom at the end) is simply treated as untagged and left to the
// filename/folder-based fallback, rather than read in full — a real, if
// uncommon, gap accepted for the sake of not reading potentially huge
// files start-to-finish on every scan.

const fs = require('fs');
const path = require('path');

const PREFIX_BYTES = 5 * 1024 * 1024;

function readPrefix(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, PREFIX_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

function readTail(filePath, tailBytes) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < tailBytes) return null;
    const buf = Buffer.alloc(tailBytes);
    fs.readSync(fd, buf, 0, tailBytes, size - tailBytes);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

// --- MP3 (ID3v2 + ID3v1 fallback) ---

function utf16beToString(buf) {
  const swapped = Buffer.from(buf);
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const tmp = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = tmp;
  }
  return swapped.toString('utf16le');
}

function decodeId3Text(buf) {
  if (buf.length === 0) return '';
  const encoding = buf[0];
  const body = buf.subarray(1);
  let text;
  if (encoding === 1) {
    // UTF-16 with a leading BOM.
    const isBE = body[0] === 0xfe && body[1] === 0xff;
    text = isBE ? utf16beToString(body.subarray(2)) : body.subarray(2).toString('utf16le');
  } else if (encoding === 2) {
    text = utf16beToString(body);
  } else if (encoding === 3) {
    text = body.toString('utf8');
  } else {
    text = body.toString('latin1');
  }
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000+$/, '').trim();
}

function readId3v2(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return null;
  const majorVersion = buf[3];
  const flags = buf[5];
  const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const tagEnd = Math.min(buf.length, 10 + tagSize);
  let pos = 10;

  if (flags & 0x40) {
    // Extended header present — syncsafe size in v2.4, plain in v2.3.
    if (majorVersion >= 4) {
      pos += ((buf[pos] & 0x7f) << 21) | ((buf[pos + 1] & 0x7f) << 14) | ((buf[pos + 2] & 0x7f) << 7) | (buf[pos + 3] & 0x7f);
    } else {
      pos += 4 + buf.readUInt32BE(pos);
    }
  }

  const result = {};
  const idLen = majorVersion === 2 ? 3 : 4;
  const headerLen = majorVersion === 2 ? 6 : 10;
  while (pos + headerLen <= tagEnd) {
    const frameId = buf.toString('latin1', pos, pos + idLen);
    if (!frameId || frameId.charCodeAt(0) === 0) break;
    let frameSize;
    if (majorVersion === 2) {
      frameSize = (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5];
    } else if (majorVersion >= 4) {
      frameSize = ((buf[pos + 4] & 0x7f) << 21) | ((buf[pos + 5] & 0x7f) << 14) | ((buf[pos + 6] & 0x7f) << 7) | (buf[pos + 7] & 0x7f);
    } else {
      frameSize = buf.readUInt32BE(pos + 4);
    }
    const frameStart = pos + headerLen;
    if (frameSize <= 0 || frameStart + frameSize > tagEnd) break;
    const frameData = buf.subarray(frameStart, frameStart + frameSize);

    if (frameId === 'TPE1' || frameId === 'TP1') result.artist = decodeId3Text(frameData);
    if (frameId === 'TALB' || frameId === 'TAL') result.album = decodeId3Text(frameData);

    pos = frameStart + frameSize;
  }
  return result.artist || result.album ? result : null;
}

function readId3v1(filePath) {
  const tag = readTail(filePath, 128);
  if (!tag || tag.toString('latin1', 0, 3) !== 'TAG') return null;
  const artist = tag.toString('latin1', 33, 63).replace(/\u0000+$/, '').trim();
  const album = tag.toString('latin1', 63, 93).replace(/\u0000+$/, '').trim();
  return artist || album ? { artist: artist || null, album: album || null } : null;
}

function readMp3Tags(filePath, buf) {
  const v2 = readId3v2(buf);
  if (v2 && v2.artist && v2.album) return v2;
  const v1 = readId3v1(filePath);
  if (!v2 && !v1) return null;
  return {
    artist: v2?.artist || v1?.artist || null,
    album: v2?.album || v1?.album || null,
  };
}

// --- FLAC / OGG (Vorbis comments) ---

function parseVorbisComment(buf) {
  let pos = 0;
  if (pos + 4 > buf.length) return null;
  const vendorLen = buf.readUInt32LE(pos);
  pos += 4 + vendorLen;
  if (pos + 4 > buf.length) return null;
  const commentCount = buf.readUInt32LE(pos);
  pos += 4;

  const result = {};
  for (let i = 0; i < commentCount && pos + 4 <= buf.length; i++) {
    const len = buf.readUInt32LE(pos);
    pos += 4;
    if (pos + len > buf.length) break;
    const entry = buf.toString('utf8', pos, pos + len);
    pos += len;
    const eq = entry.indexOf('=');
    if (eq === -1) continue;
    const key = entry.slice(0, eq).toUpperCase();
    const value = entry.slice(eq + 1);
    if (key === 'ARTIST' && !result.artist) result.artist = value;
    if (key === 'ALBUM' && !result.album) result.album = value;
  }
  return result.artist || result.album ? result : null;
}

function readFlacTags(buf) {
  if (buf.length < 4 || buf.toString('latin1', 0, 4) !== 'fLaC') return null;
  let pos = 4;
  while (pos + 4 <= buf.length) {
    const blockHeader = buf[pos];
    const isLast = (blockHeader & 0x80) !== 0;
    const blockType = blockHeader & 0x7f;
    const blockLen = (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
    const blockStart = pos + 4;
    if (blockStart + blockLen > buf.length) return null;
    if (blockType === 4) return parseVorbisComment(buf.subarray(blockStart, blockStart + blockLen));
    pos = blockStart + blockLen;
    if (isLast) break;
  }
  return null;
}

// Ogg is page-based: each page starts with "OggS", carries a segment
// table describing how to split its payload into packets, and a packet
// (here, the Vorbis comment header) can span multiple segments — a
// segment length of exactly 255 means "more of this packet follows in the
// next segment/page" rather than "this segment is 255 bytes and the
// packet ends here".
function readOggTags(buf) {
  let pos = 0;
  let packet = Buffer.alloc(0);
  while (pos + 27 <= buf.length && buf.toString('latin1', pos, pos + 4) === 'OggS') {
    const pageSegments = buf[pos + 26];
    const segTableStart = pos + 27;
    if (segTableStart + pageSegments > buf.length) return null;
    const segTable = buf.subarray(segTableStart, segTableStart + pageSegments);
    let cursor = segTableStart + pageSegments;

    for (const segLen of segTable) {
      if (cursor + segLen > buf.length) return null;
      packet = Buffer.concat([packet, buf.subarray(cursor, cursor + segLen)]);
      cursor += segLen;
      if (segLen < 255) {
        if (packet.length >= 7 && packet[0] === 0x03 && packet.toString('latin1', 1, 7) === 'vorbis') {
          return parseVorbisComment(packet.subarray(7));
        }
        packet = Buffer.alloc(0);
      }
    }
    pos = cursor;
  }
  return null;
}

// --- M4A (MP4 atom tree) ---

// Walks a dotted chain of atom names (e.g. moov > udta > meta > ilst) —
// "meta" is special-cased since, unlike the others, it has its own 4-byte
// version/flags field before its children.
function findAtomPath(buf, start, end, names) {
  let pos = start;
  const target = names[0];
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let headerLen = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      size = Number(buf.readBigUInt64BE(pos + 8));
      headerLen = 16;
    }
    if (size < headerLen || pos + size > end) break;
    if (type === target) {
      let childStart = pos + headerLen;
      if (type === 'meta') childStart += 4;
      if (names.length === 1) return { start: childStart, end: pos + size };
      return findAtomPath(buf, childStart, pos + size, names.slice(1));
    }
    pos += size;
  }
  return null;
}

// Each ilst child (e.g. "\xa9ART") wraps its actual value in a nested
// "data" atom: size(4) type(4)="data" version/flags(4) locale(4) value...
function readMp4DataValue(buf, start, end) {
  let pos = start;
  while (pos + 16 <= end) {
    const size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (size < 8 || pos + size > end) break;
    if (type === 'data') {
      const valueStart = pos + 16;
      if (valueStart <= pos + size) return buf.toString('utf8', valueStart, pos + size).replace(/\u0000+$/, '');
    }
    pos += size;
  }
  return null;
}

function readMp4Tags(buf) {
  const ilst = findAtomPath(buf, 0, buf.length, ['moov', 'udta', 'meta', 'ilst']);
  if (!ilst) return null;

  const result = {};
  let pos = ilst.start;
  while (pos + 8 <= ilst.end) {
    const size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (size < 8 || pos + size > ilst.end) break;
    if (type === '©ART' || type === 'aART') {
      const v = readMp4DataValue(buf, pos + 8, pos + size);
      if (v && !result.artist) result.artist = v;
    }
    if (type === '©alb') {
      const v = readMp4DataValue(buf, pos + 8, pos + size);
      if (v && !result.album) result.album = v;
    }
    pos += size;
  }
  return result.artist || result.album ? result : null;
}

// Returns { artist, album } (either possibly null) or null if the file
// couldn't be read as that format at all. Never throws — a corrupt or
// unusual file just falls back to the caller's own folder-based guess,
// same as any other guess that misses.
function readAudioTags(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const buf = readPrefix(filePath);
    if (ext === '.mp3') return readMp3Tags(filePath, buf);
    if (ext === '.flac') return readFlacTags(buf);
    if (ext === '.ogg') return readOggTags(buf);
    if (ext === '.m4a') return readMp4Tags(buf);
    return null;
  } catch {
    return null;
  }
}

module.exports = { readAudioTags };
