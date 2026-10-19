const fs = require('fs');
const path = require('path');
const db = require('../db');
const tmdb = require('./tmdb');
const tvdb = require('./tvdb');
const openlibrary = require('./openlibrary');
const comicSources = require('./comicSources');
const discogs = require('./discogs');
const launchbox = require('./launchboxLibrary');
const apple = require('./apple');
const { getLaunchboxDir } = require('./libraryPaths');
const { fetchCoverUrl: fetchAudiobookCoverUrl } = require('./addAudiobook');
const { fetchCoverUrl: fetchAlbumCoverUrl } = require('./addAlbum');
const { cachePoster, cacheImageFromUrl, cacheImageFromLocalFile, IMAGE_FOLDERS } = require('./images');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const POSTERS_DIR = path.join(DATA_DIR, 'posters');

// "Refetch All Images": for every item that's matched to a source, ask that
// source for its image again and replace what's cached on disk — the
// recovery path for covers that are missing (a database backup restored
// without its poster files), corrupt, or just outdated at the source.
//
// Deliberately separate from "Refresh All Metadata", which leaves images
// alone so a hand-picked cover isn't overwritten by a routine refresh. This
// one DOES replace hand-picked covers on purpose — that's what "refetch
// all" means — and the UI says so before it runs. What it never touches:
// the pictures chosen for author/series/artist/platform/store groups and
// Movies collections (those are a separate, wholly user-chosen thing).
//
// Safety rule throughout: the old image is only ever replaced by a new one
// that was actually fetched and validated. An item whose source can't be
// reached, has no usable image, or isn't matched to a source keeps exactly
// what it had.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FatalForType extends Error {}

// A bulk job that hammers a free API gets the user's IP throttled or blocked
// — which then breaks everything else that uses that API (searching, adding,
// rescanning) for a while. So every type is paced, a rate-limited-looking
// failure is retried after a growing wait, and a run of consecutive failures
// stops the type instead of carrying on against a service that's saying no.
const DEFAULT_DELAY_MS = 300;
const RETRY_WAITS_MS = [5000, 20000, 60000];
const MAX_CONSECUTIVE_FAILURES = 5;
const looksRateLimited = (err) => /\b(429|403|5\d\d)\b|rate.?limit|too many|timed? ?out|ECONNRESET|fetch failed/i.test(err.message || '');
// Test hook: scale all waits down.
const waitScale = () => Number(process.env.REFETCH_WAIT_SCALE ?? 1);

// ---- per-type definitions ----------------------------------------------
// rows(ctx): the items to process. refetch(row, ctx): resolves to
// { column: newFilename } for each image column it successfully refetched
// (omit a column to leave it alone), or null when there's nothing to do.
const DEFS = {
  movies: {
    label: 'Movies',
    table: 'movies',
    delayMs: 300, // TMDB allows far more; this is just politeness
    rows: () => db.prepare('SELECT id, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all(),
    async refetch(row) {
      const details = await tmdb.getMovieDetails(db, row.tmdb_id);
      const out = {};
      const poster = await cachePoster(DATA_DIR, details.poster_path, { force: true, folder: IMAGE_FOLDERS.moviePoster });
      if (poster) out.poster_file = poster;
      const backdrop = await cachePoster(DATA_DIR, details.backdrop_path, { force: true, folder: IMAGE_FOLDERS.movieBackdrop });
      if (backdrop) out.backdrop_file = backdrop;
      return out;
    },
  },

  // Franchise collections ("Star Wars Collection", ...) take their poster
  // from TMDB. Manual collections have no source — they're the auto-collage
  // or a picture the user chose — so they're left alone. Runs whenever
  // Movies does (see startRefetch).
  collections: {
    label: 'Movie collections',
    table: 'collections',
    delayMs: 300,
    rows: () => db.prepare("SELECT id, tmdb_collection_id FROM collections WHERE type = 'franchise' AND tmdb_collection_id IS NOT NULL").all(),
    async refetch(row) {
      const details = await tmdb.getCollectionDetails(db, row.tmdb_collection_id);
      if (!details.poster_path) return null;
      const poster = await cachePoster(DATA_DIR, details.poster_path, { force: true, folder: IMAGE_FOLDERS.movieCollection });
      return poster ? { poster_file: poster } : null;
    },
  },

  tv: {
    label: 'TV Shows',
    table: 'tv_shows',
    rows: () => db.prepare('SELECT id, tvdb_id FROM tv_shows WHERE tvdb_id IS NOT NULL').all(),
    async refetch(row) {
      const details = await tvdb.getSeriesDetails(db, row.tvdb_id);
      const out = {};
      if (details.image) out.poster_file = await cacheImageFromUrl(DATA_DIR, details.image, { force: true, folder: IMAGE_FOLDERS.tvPoster });
      const backdropUrl = await tvdb.getBackdropUrl(db, details).catch(() => null);
      if (backdropUrl) {
        const backdrop = await cacheImageFromUrl(DATA_DIR, backdropUrl, { force: true, folder: IMAGE_FOLDERS.tvBackdrop }).catch(() => null);
        if (backdrop) out.backdrop_file = backdrop;
      }
      return out;
    },
  },

  audiobooks: {
    label: 'Audiobooks',
    table: 'audiobooks',
    // Audnexus allows 300 requests/minute; Apple's lookup is far stricter
    // (~20/minute), so Apple-matched books are looked up in batches up front
    // — one request per 100 books — and only the image downloads remain.
    delayMs: 300,
    async rows(ctx) {
      const rows = db.prepare('SELECT id, asin, metadata_source FROM audiobooks WHERE asin IS NOT NULL').all();
      const appleIds = rows.filter((r) => r.metadata_source === 'apple').map((r) => r.asin);
      ctx.appleCovers = new Map();
      for (let i = 0; i < appleIds.length; i += 100) {
        if (i) await sleep(3500 * waitScale());
        const found = await withRetry(() => apple.getAudiobooksByIds(appleIds.slice(i, i + 100)));
        for (const [id, result] of found) ctx.appleCovers.set(id, apple.upsizeArtwork(result.artworkUrl100));
      }
      return rows;
    },
    async refetch(row, ctx) {
      const source = row.metadata_source || 'audible';
      const url = source === 'apple' ? ctx.appleCovers.get(String(row.asin)) : await fetchAudiobookCoverUrl(source, row.asin);
      return url ? { cover_file: await cacheImageFromUrl(DATA_DIR, url, { force: true, folder: IMAGE_FOLDERS.audiobook }) } : null;
    },
  },

  comics: {
    label: 'Comics',
    table: 'comics',
    delayMs: 1000, // ComicVine rate-limits aggressively
    rows: () => db.prepare('SELECT id, external_id, metadata_source FROM comics WHERE external_id IS NOT NULL').all(),
    async refetch(row) {
      const details = await comicSources.getIssueDetails(db, row.metadata_source || 'comicvine', row.external_id);
      return details.cover_url ? { cover_file: await cacheImageFromUrl(DATA_DIR, details.cover_url, { force: true, folder: IMAGE_FOLDERS.comic }) } : null;
    },
  },

  ebooks: {
    label: 'Ebooks',
    table: 'ebooks',
    delayMs: 500,
    rows: () => db.prepare('SELECT id, external_id FROM ebooks WHERE external_id IS NOT NULL').all(),
    async refetch(row) {
      const details = await openlibrary.getBookByKey(row.external_id);
      return details.cover_url ? { cover_file: await cacheImageFromUrl(DATA_DIR, details.cover_url, { force: true, folder: IMAGE_FOLDERS.ebook }) } : null;
    },
  },

  albums: {
    label: 'Digital',
    table: 'albums',
    delayMs: 1100, // MusicBrainz asks for at most ~1 request per second
    rows: () => db.prepare('SELECT id, external_id, metadata_source FROM albums WHERE external_id IS NOT NULL').all(),
    async refetch(row) {
      const url = await fetchAlbumCoverUrl(row.metadata_source || 'musicbrainz', row.external_id);
      return url ? { cover_file: await cacheImageFromUrl(DATA_DIR, url, { force: true, folder: IMAGE_FOLDERS.album }) } : null;
    },
  },

  // Vinyl has no per-item lookup — a record's image URL only comes with the
  // collection listing itself — so the whole collection is fetched once up
  // front and each record's cover picked out of it.
  vinyl: {
    label: 'Vinyl',
    table: 'vinyl_records',
    delayMs: 500,
    async rows(ctx) {
      const username = discogs.getUsername(db);
      const token = discogs.getApiKey(db);
      if (!username || !token) throw new FatalForType('Discogs username/token not configured. Add them in Settings.');
      const items = await discogs.fetchCollection(username, token);
      ctx.vinylCovers = new Map(items.map((i) => [i.discogs_instance_id, i.cover_url]));
      // Same brief pause vinylSync.js takes between the Discogs API and the
      // image host, for the same (environment-specific) reason.
      await sleep(500);
      return db.prepare('SELECT id, discogs_instance_id FROM vinyl_records').all();
    },
    async refetch(row, ctx) {
      const url = ctx.vinylCovers.get(row.discogs_instance_id);
      return url ? { cover_file: await cacheImageFromUrl(DATA_DIR, url, { force: true, folder: IMAGE_FOLDERS.vinyl }) } : null;
    },
  },

  // Games' images aren't downloaded at all — they're copied from the local
  // LaunchBox folder — so this re-reads that folder and re-copies each cover.
  games: {
    label: 'Games',
    table: 'games',
    delayMs: 0, // local files only
    rows(ctx) {
      const dir = getLaunchboxDir();
      if (!dir) throw new FatalForType('LaunchBox folder not configured. Choose it in Settings (Games).');
      if (!fs.existsSync(dir)) throw new FatalForType(`LaunchBox folder (${dir}) is not reachable.`);
      ctx.gameCovers = new Map(launchbox.listAllGames(dir).map((g) => [g.launchbox_id, g.cover_path]));
      return db.prepare('SELECT id, launchbox_id FROM games').all();
    },
    async refetch(row, ctx) {
      const src = ctx.gameCovers.get(row.launchbox_id);
      return src ? { cover_file: cacheImageFromLocalFile(DATA_DIR, src, { force: true, folder: IMAGE_FOLDERS.game }) } : null;
    },
  },
};

const TYPE_ORDER = ['movies', 'collections', 'tv', 'audiobooks', 'comics', 'ebooks', 'albums', 'vinyl', 'games'];

// ---- orphan cleanup ---------------------------------------------------
// When an item's image moves to a differently-named file (the source's URL
// changed, or a hand-picked cover is being replaced), the old file would be
// left behind forever — unless something else still points at it (images are
// named by hash, so two items can legitimately share one).
const REFERENCES = [
  ['movies', 'poster_file'], ['movies', 'backdrop_file'], ['tv_shows', 'poster_file'], ['tv_shows', 'backdrop_file'],
  ['audiobooks', 'cover_file'], ['ebooks', 'cover_file'], ['comics', 'cover_file'], ['albums', 'cover_file'],
  ['vinyl_records', 'cover_file'], ['games', 'cover_file'], ['collections', 'poster_file'], ['group_images', 'cover_file'],
];
let referenceStatements = null;

function isReferenced(file) {
  if (!referenceStatements) {
    referenceStatements = REFERENCES.map(([table, column]) => db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`));
  }
  return referenceStatements.some((stmt) => stmt.get(file));
}

function removeIfUnreferenced(file) {
  // \`file\` is a path relative to the posters folder ('Movies/Posters/x.jpg').
  if (!file || file.includes('..') || file.includes('\\')) return;
  if (isReferenced(file)) return;
  try {
    fs.unlinkSync(path.join(POSTERS_DIR, ...file.split('/')));
  } catch {
    /* already gone — fine */
  }
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_WAITS_MS.length || !looksRateLimited(err)) throw err;
      await sleep(RETRY_WAITS_MS[attempt] * waitScale());
    }
  }
}

// ---- runner ------------------------------------------------------------
// In-memory, like the bulk metadata refreshes: an occasional maintenance
// action, safe to simply re-run if the app restarts partway.
let status = { running: false, types: [], current: null, total: 0, done: 0, failed: 0, skipped: 0, message: 'Idle' };

function progressMessage() {
  const label = status.current ? DEFS[status.current].label : '';
  const processed = status.done + status.failed + status.skipped;
  return `Refetching ${label} images — ${processed} of ${status.total}${status.failed ? ` (${status.failed} failed)` : ''}...`;
}

async function runType(type, ctx, summary) {
  const def = DEFS[type];
  status.current = type;
  let rows;
  try {
    rows = await def.rows(ctx);
  } catch (err) {
    summary.push(`${def.label}: ${err.message}`);
    return;
  }

  status.total = rows.length;
  status.done = 0;
  status.failed = 0;
  status.skipped = 0;
  status.message = progressMessage();

  let aborted = null;
  let consecutiveFailures = 0;
  const delayMs = def.delayMs ?? DEFAULT_DELAY_MS;
  status.lastError = null;

  for (const row of rows) {
    try {
      const updates = await withRetry(() => def.refetch(row, ctx));
      consecutiveFailures = 0;
      const entries = Object.entries(updates || {}).filter(([, file]) => file);
      if (!entries.length) {
        status.skipped++;
      } else {
        const names = entries.map(([column]) => column);
        const before = db.prepare(`SELECT ${names.join(', ')} FROM ${def.table} WHERE id = ?`).get(row.id) || {};
        const set = names.map((column) => `${column} = @${column}`).join(', ');
        db.prepare(`UPDATE ${def.table} SET ${set} WHERE id = @id`).run({ ...Object.fromEntries(entries), id: row.id });
        for (const [column, file] of entries) {
          if (before[column] && before[column] !== file) removeIfUnreferenced(before[column]);
        }
        status.done++;
      }
    } catch (err) {
      if (/not configured/i.test(err.message || '')) {
        // Every remaining item would fail the same way — stop here instead
        // of racking up thousands of identical failures.
        aborted = err.message;
        break;
      }
      status.failed++;
      status.lastError = err.message;
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = `stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row (last error: ${err.message}). The source may be rate-limiting or blocking requests — wait a while and run it again. Items already done are kept.`;
        break;
      }
    }
    status.message = progressMessage();
    // Pace requests, and yield so a long run of purely local work (Games)
    // can't starve other requests.
    if (delayMs) await sleep(delayMs * waitScale());
    else await new Promise((resolve) => setImmediate(resolve));
  }

  const parts = [`${status.done} refetched`];
  if (status.skipped) parts.push(`${status.skipped} skipped (no image at the source)`);
  if (status.failed) parts.push(`${status.failed} failed — their existing images were kept, run it again to retry`);
  if (status.lastError && !aborted && status.failed) parts.push(`last error: ${status.lastError}`);
  summary.push(`${def.label}: ${aborted ? `${status.done} refetched, ${aborted}` : parts.join(', ')}`);
}

async function runRefetch(types) {
  status = { running: true, types, current: null, total: 0, done: 0, failed: 0, skipped: 0, message: 'Starting...' };
  const ctx = {};
  const summary = [];
  try {
    for (const type of types) await runType(type, ctx, summary);
    status.message = `Done. ${summary.join(' · ')}`;
  } catch (err) {
    status.message = `Refetch stopped: ${err.message}`;
  }
  status.running = false;
  status.current = null;
}

function startRefetch(requested) {
  if (status.running) return false;
  // Movie collection posters come with the movies — one button for both.
  const wanted = requested.includes('movies') ? [...requested, 'collections'] : requested;
  const types = TYPE_ORDER.filter((t) => wanted.includes(t));
  if (!types.length) throw new Error('No valid media types given');
  runRefetch(types);
  return true;
}

function getStatus() {
  return status;
}

module.exports = { startRefetch, getStatus, TYPE_ORDER, DEFS };
