// Cover art from the Steam store — no API key needed. Steam's store search
// finds the app, and its artwork lives at predictable CDN paths. Only covers
// games sold on Steam, but for those it's the same art Steam itself shows.
const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const USER_AGENT = 'media-catalog (self-hosted personal use; https://github.com/tet0r/media-catalog)';
const MAX_APPS = 5;

// Steam has moved its artwork between CDN hosts over the years; either may
// serve a given app, so each image is tried on both.
const CDN_HOSTS = [
  'https://cdn.cloudflare.steamstatic.com/steam/apps',
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps',
];

// Portrait first — it's the shape a library cover wants — then the wide
// header as an alternative.
const IMAGE_KINDS = [
  { file: 'library_600x900.jpg', label: 'portrait' },
  { file: 'header.jpg', label: 'header' },
];

async function exists(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function firstWorking(appId, file) {
  for (const host of CDN_HOSTS) {
    const url = `${host}/${appId}/${file}`;
    if (await exists(url)) return url;
  }
  return null;
}

async function searchCovers(title) {
  if (!title) return [];
  const url = new URL(SEARCH_URL);
  url.searchParams.set('term', title);
  url.searchParams.set('l', 'english');
  url.searchParams.set('cc', 'US');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Steam search failed: ${res.status}`);
  const data = await res.json();
  const apps = (data.items || []).filter((i) => i.type === 'app').slice(0, MAX_APPS);

  const lookups = apps.flatMap((app) =>
    IMAGE_KINDS.map(async (kind) => {
      const found = await firstWorking(app.id, kind.file);
      return found ? { url: found, thumbnail_url: found, label: `${app.name} — ${kind.label}` } : null;
    })
  );
  return (await Promise.all(lookups)).filter(Boolean);
}

module.exports = { searchCovers };
