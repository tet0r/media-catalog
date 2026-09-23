const fs = require('fs');
const zlib = require('zlib');

// Minimal ZIP reader — just enough to pull a couple of small XML files out
// of an EPUB, which is a plain ZIP archive under the hood. No archiver/
// unzip dependency needed: Node's built-in zlib handles the one
// compression method (deflate) ZIP entries actually use besides "stored".

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buf) {
  // The EOCD record is a fixed 22 bytes plus a variable-length comment at
  // the very end of the file — scan backward for its signature rather than
  // parsing forward, since the comment length isn't known in advance.
  const minPos = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function readCentralDirectory(buf) {
  const eocdPos = findEndOfCentralDirectory(buf);
  if (eocdPos === -1) throw new Error('Not a valid zip file (no end-of-central-directory record)');
  const entryCount = buf.readUInt16LE(eocdPos + 10);
  const cdOffset = buf.readUInt32LE(eocdPos + 16);

  const entries = new Map();
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(pos) !== CENTRAL_DIR_SIGNATURE) break;
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    entries.set(name, { compressionMethod, compressedSize, localHeaderOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  const pos = entry.localHeaderOffset;
  if (buf.readUInt32LE(pos) !== LOCAL_HEADER_SIGNATURE) throw new Error('Corrupt zip local file header');
  const nameLen = buf.readUInt16LE(pos + 26);
  const extraLen = buf.readUInt16LE(pos + 28);
  const dataStart = pos + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return raw;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported zip compression method ${entry.compressionMethod}`);
}

// Returns one entry's contents as UTF-8 text, or null if the archive has no
// entry by that name. Entry names use forward slashes and are looked up
// case-insensitively as a fallback, since not every EPUB producer
// normalizes path casing consistently.
function readZipEntryText(filePath, entryName) {
  const buf = fs.readFileSync(filePath);
  const entries = readCentralDirectory(buf);
  let entry = entries.get(entryName);
  if (!entry) {
    const lower = entryName.toLowerCase();
    for (const [name, e] of entries) {
      if (name.toLowerCase() === lower) { entry = e; break; }
    }
  }
  if (!entry) return null;
  return readEntry(buf, entry).toString('utf8');
}

module.exports = { readZipEntryText };
