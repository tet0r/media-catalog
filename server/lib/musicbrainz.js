// Album metadata via MusicBrainz (the open, editorially-curated database
// self-hosted tools like Beets/Picard/Navidrome build on), plus the Cover
// Art Archive for artwork. Both are free and need no API key, but
// MusicBrainz's usage policy caps unauthenticated clients at 1 request/
// second and requires a descriptive User-Agent — both handled centrally
// here (mbFetch), so every caller in this app automatically respects the
// limit regardless of how many MusicBrainz calls one operation chains
// together (search, then a release-group lookup, then a release lookup).

const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org';
const USER_AGENT = 'media-catalog/1.0 (+https://github.com/tet0r/media-catalog)';
const MB_MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MB_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function mbFetch(url) {
  await throttle();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MusicBrainz request failed: ${res.status}`);
  return res.json();
}

function artistCreditName(artistCredit) {
  return (artistCredit || []).map((c) => c.name).join(', ') || null;
}

function toCandidate(rg) {
  return {
    key: rg.id,
    title: rg.title,
    artist: artistCreditName(rg['artist-credit']),
    year: rg['first-release-date'] ? parseInt(rg['first-release-date'].slice(0, 4), 10) : null,
  };
}

async function searchAlbums(query) {
  if (!query) return [];
  const url = new URL(`${MB_BASE}/release-group/`);
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '15');
  const data = await mbFetch(url);
  return (data['release-groups'] || []).map(toCandidate);
}

// Not fetched here — this URL either redirects to a real image or 404s,
// and the caller's own image-caching step handles that fetch and tolerates
// the 404 (most release-groups in a personal collection won't have
// archived art; this is normal, not an error).
function coverArtUrl(releaseGroupId) {
  return `${CAA_BASE}/release-group/${releaseGroupId}/front-500`;
}

async function getReleaseTracklist(releaseId) {
  const url = new URL(`${MB_BASE}/release/${encodeURIComponent(releaseId)}`);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('inc', 'recordings');
  const data = await mbFetch(url);
  const tracks = [];
  for (const medium of data.media || []) {
    for (const t of medium.tracks || []) {
      tracks.push({ title: t.title, length_ms: t.length || null });
    }
  }
  return tracks;
}

// Full detail for one album by release-group MBID — used both for Add/
// resolving a Needs Review item and for a metadata refresh. Genres and
// artist-credit come from the release-group lookup itself; the tracklist
// needs a second lookup on one of the group's actual releases, since a
// release-group (the abstract "album") has no tracklist of its own — only
// its specific releases (regular edition, remaster, ...) do.
async function getAlbumDetails(mbid) {
  const url = new URL(`${MB_BASE}/release-group/${encodeURIComponent(mbid)}`);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('inc', 'genres+artist-credits+releases');
  const rg = await mbFetch(url);

  const releases = rg.releases || [];
  const chosen = releases.find((r) => r.status === 'Official') || releases[0];
  let tracks = [];
  if (chosen) {
    try {
      tracks = await getReleaseTracklist(chosen.id);
    } catch {
      tracks = [];
    }
  }

  return {
    key: mbid,
    title: rg.title,
    artist: artistCreditName(rg['artist-credit']),
    year: rg['first-release-date'] ? parseInt(rg['first-release-date'].slice(0, 4), 10) : null,
    genres: (rg.genres || []).map((g) => g.name).slice(0, 8),
    tracks,
    cover_url: coverArtUrl(mbid),
  };
}

module.exports = { searchAlbums, getAlbumDetails, coverArtUrl };
