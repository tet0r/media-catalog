const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

// Downloading an image from a URL somebody typed or picked is the one place
// this server fetches an address it doesn't control, so it has to be careful:
// left alone, "fetch this image" is also "fetch anything your server can reach"
// — the router's admin page, a NAS, Portainer, Home Assistant, a cloud
// metadata address — and the response would then be saved and handed back
// from /posters. So this only talks to PUBLIC addresses, and checks that at the
// moment it connects (a hostname that resolved to a public address a moment
// ago can't be swapped for a private one), follows redirects itself so every
// hop is checked too, stops at a size limit, and insists the response really is
// an image.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 20 * 1000;
const MAX_REDIRECTS = 5;

// ---- which addresses count as public --------------------------------------
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (and the broadcast address)
]) {
  blocked.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds an IPv4 address)
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
]) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

// 16 bytes of an IPv6 address, or null if it isn't one.
function ipv6Bytes(ip) {
  let text = ip.toLowerCase().split('%')[0];
  let tail = [];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[1].split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => n > 255)) return null;
    tail = parts;
    text = text.slice(0, -dotted[1].length) + '0:0';
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toWords = (s) => (s ? s.split(':') : []);
  const head = toWords(halves[0]);
  const rest = halves.length === 2 ? toWords(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const words = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const bytes = [];
  for (const w of words) {
    if (!/^[0-9a-f]{1,4}$/.test(w)) return null;
    const n = parseInt(w, 16);
    bytes.push(n >> 8, n & 255);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes.length === 16 ? bytes : null;
}

function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    const bytes = ipv6Bytes(ip);
    if (!bytes) return false;
    // ::ffff:a.b.c.d is an IPv4 address in disguise — judge it as one.
    const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255;
    if (mapped) return !blocked.check(bytes.slice(12).join('.'), 'ipv4');
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

// Runs when the socket is about to connect: whatever the name resolves to is
// filtered here, so there's no gap between "checked" and "connected to".
function guardedLookup(isAllowed) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const allowed = addresses.filter((a) => isAllowed(a.address));
      if (!allowed.length) return callback(new Error(`Refusing to connect to ${hostname}: not a public address`));
      if (options && options.all) return callback(null, allowed);
      return callback(null, allowed[0].address, allowed[0].family);
    });
  };
}

// ---- what counts as an image ----------------------------------------------
// By the file's own first bytes, not by what the server claims it is.
function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.slice(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// ---- the download -----------------------------------------------------------
function assertAllowedUrl(url, isAllowed) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https image addresses are allowed');
  if (url.username || url.password) throw new Error('Image addresses with a login in them are not allowed');
  // A literal IP in the URL never goes through DNS, so it's checked here.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isAllowed(host)) throw new Error('Refusing to fetch from a non-public address');
}

function openRequest(url, { timeoutMs, isAllowed, headers }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method: 'GET', headers, lookup: guardedLookup(isAllowed), timeout: timeoutMs },
      (res) => resolve({ res, req })
    );
    req.on('timeout', () => req.destroy(new Error('Timed out fetching the image')));
    req.on('error', reject);
    req.end();
  });
}

function readCapped(res, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const timer = setTimeout(() => res.destroy(new Error('Timed out downloading the image')), timeoutMs);
    res.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        res.destroy(new Error(`Image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`));
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    res.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    res.on('close', () => clearTimeout(timer));
  });
}

// Resolves to { buffer, contentType } where contentType is what the bytes
// really are (image/jpeg, image/png, image/gif or image/webp).
// `isAllowed` exists so the tests can exercise the HTTP handling against a
// local server; nothing a request can supply reaches it.
async function fetchPublicImage(rawUrl, options = {}) {
  const {
    maxBytes = MAX_IMAGE_BYTES,
    timeoutMs = TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    isAllowed = isPublicAddress,
  } = options;
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error('Not a valid image address');
  }
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    // Avoids formats this app can't store (AVIF), and identity so the bytes
    // can be checked as they arrive.
    Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.5',
    'Accept-Encoding': 'identity',
  };

  for (let hop = 0; ; hop++) {
    assertAllowedUrl(url, isAllowed);
    const { res } = await openRequest(url, { timeoutMs, isAllowed, headers });
    const status = res.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      res.resume();
      if (hop >= maxRedirects) throw new Error('Too many redirects fetching the image');
      url = new URL(res.headers.location, url);
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new Error(`Failed to fetch image: ${status}`);
    }
    const declared = Number(res.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.destroy();
      throw new Error(`Image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }
    const buffer = await readCapped(res, maxBytes, timeoutMs);
    if (!buffer.length) throw new Error('Image response was empty');
    const contentType = sniffImageType(buffer);
    if (!contentType) throw new Error('That address did not return a JPEG, PNG, GIF or WebP image');
    return { buffer, contentType };
  }
}

module.exports = { fetchPublicImage, sniffImageType, isPublicAddress, MAX_IMAGE_BYTES };
