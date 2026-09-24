const express = require('express');
const db = require('../db');
const tmdb = require('../lib/tmdb');
const audible = require('../lib/audible');
const apple = require('../lib/apple');
const openlibrary = require('../lib/openlibrary');
const musicbrainz = require('../lib/musicbrainz');
const lastfm = require('../lib/lastfm');

const router = express.Router();

router.get('/tmdb', async (req, res) => {
  try {
    const { q, year } = req.query;
    if (!q) return res.json([]);
    const results = await tmdb.searchMovies(db, q, year);
    res.json(results.map((r) => ({
      tmdb_id: r.id,
      title: r.title,
      original_title: r.original_title,
      year: r.release_date ? r.release_date.slice(0, 4) : null,
      overview: r.overview,
      poster_url: r.poster_path ? `${tmdb.IMG_BASE}/w200${r.poster_path}` : null,
      tmdb_rating: r.vote_average,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search just doesn't surface the right movie:
// paste a themoviedb.org OR imdb.com movie page URL and fetch that exact
// one. An IMDb URL is resolved to a TMDB ID via TMDB's own /find endpoint
// first (imdb.com has no public API of its own to hit directly).
router.get('/tmdb-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const tmdbMatch = str.match(/themoviedb\.org\/movie\/(\d+)/);
    const imdbMatch = str.match(/imdb\.com\/title\/(tt\d+)/);

    let tmdbId;
    if (tmdbMatch) {
      tmdbId = tmdbMatch[1];
    } else if (imdbMatch) {
      const found = await tmdb.findByImdbId(db, imdbMatch[1]);
      const movie = (found.movie_results || [])[0];
      if (!movie) {
        return res.status(404).json({ error: `No TMDB movie found for IMDb ID ${imdbMatch[1]}` });
      }
      tmdbId = movie.id;
    } else {
      return res.status(400).json({
        error: 'Not a recognizable themoviedb.org or imdb.com movie URL (expected .../movie/<id>-... or .../title/tt.../)',
      });
    }

    const details = await tmdb.getMovieDetails(db, tmdbId);
    res.json({
      tmdb_id: details.id,
      title: details.title,
      original_title: details.original_title,
      year: details.release_date ? details.release_date.slice(0, 4) : null,
      overview: details.overview,
      poster_url: details.poster_path ? `${tmdb.IMG_BASE}/w200${details.poster_path}` : null,
      tmdb_rating: details.vote_average,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/audible', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await audible.searchAudiobooks(q);
    res.json(results.map((r) => ({
      asin: r.asin,
      title: r.title,
      subtitle: r.subtitle,
      authors: r.authors,
      year: r.release_date ? r.release_date.slice(0, 4) : null,
      cover_url: r.cover_url,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search doesn't surface the right book: paste an
// audible.com product URL and resolve its ASIN directly. Audible product
// URLs always end in a 10-character ASIN, either as the last path segment
// or after a trailing slash-prefixed title slug.
router.get('/audible-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const match = str.match(/audible\.[a-z.]+\/pd\/(?:[^/?]*\/)?([A-Z0-9]{10})(?:[/?]|$)/i);
    if (!match) {
      return res.status(400).json({
        error: 'Not a recognizable audible.com product URL (expected .../pd/.../<ASIN>)',
      });
    }
    const asin = match[1].toUpperCase();
    const details = await audible.getAudiobookByAsin(asin);
    res.json({
      asin: details.asin || asin,
      title: details.title,
      subtitle: details.subtitle || null,
      authors: (details.authors || []).map((a) => a.name),
      year: details.releaseDate ? details.releaseDate.slice(0, 4) : null,
      cover_url: details.image || null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/apple', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await apple.searchAudiobooks(q);
    res.json(results.map((r) => ({
      asin: r.asin,
      title: r.title,
      subtitle: r.subtitle,
      authors: r.authors,
      year: r.release_date ? r.release_date.slice(0, 4) : null,
      cover_url: r.cover_url,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search doesn't surface the right book: paste a
// books.apple.com audiobook URL and resolve its collection ID directly.
router.get('/apple-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const match = str.match(/books\.apple\.com\/[a-z]{2}\/audiobook\/(?:[^/?]*\/)?id(\d+)/i);
    if (!match) {
      return res.status(400).json({
        error: 'Not a recognizable books.apple.com audiobook URL (expected .../audiobook/.../id<digits>)',
      });
    }
    const details = await apple.getAudiobookById(match[1]);
    res.json({
      asin: String(details.collectionId),
      title: apple.cleanCollectionName(details.collectionName),
      subtitle: null,
      authors: details.artistName ? [details.artistName] : [],
      year: details.releaseDate ? details.releaseDate.slice(0, 4) : null,
      cover_url: apple.upsizeArtwork(details.artworkUrl100),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/openlibrary', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await openlibrary.searchBooks(q);
    res.json(results.map((r) => ({
      key: r.key,
      title: r.title,
      authors: r.authors,
      year: r.year,
      cover_url: r.cover_url,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search doesn't surface the right book: paste an
// openlibrary.org work URL and resolve its work key directly.
router.get('/openlibrary-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const match = str.match(/openlibrary\.org\/works\/(OL\d+W)/i);
    if (!match) {
      return res.status(400).json({
        error: 'Not a recognizable openlibrary.org work URL (expected .../works/OL...W)',
      });
    }
    const key = match[1].toUpperCase();
    const details = await openlibrary.getBookByKey(key);
    res.json({
      key,
      title: details.title,
      authors: details.authors,
      year: details.year,
      cover_url: details.cover_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/musicbrainz', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await musicbrainz.searchAlbums(q);
    res.json(results.map((r) => ({
      key: r.key,
      title: r.title,
      artist: r.artist,
      year: r.year,
      cover_url: musicbrainz.coverArtUrl(r.key),
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search doesn't surface the right album: paste a
// musicbrainz.org release-group URL and resolve its MBID directly.
router.get('/musicbrainz-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const match = str.match(/musicbrainz\.org\/release-group\/([0-9a-f-]{36})/i);
    if (!match) {
      return res.status(400).json({
        error: 'Not a recognizable musicbrainz.org release-group URL (expected .../release-group/<id>)',
      });
    }
    const details = await musicbrainz.getAlbumDetails(match[1]);
    res.json({
      key: details.key,
      title: details.title,
      artist: details.artist,
      year: details.year,
      cover_url: details.cover_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/lastfm', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = await lastfm.searchAlbums(db, q);
    res.json(results.map((r) => ({
      key: r.key,
      title: r.title,
      artist: r.artist,
      year: r.year,
      cover_url: r.cover_url,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback for when title search doesn't surface the right album: paste a
// last.fm album URL (last.fm/music/<Artist>/<Album>) and resolve it
// directly — no separate ID-lookup call needed, since the URL already
// carries the artist+album name that album.getInfo resolves by.
router.get('/lastfm-url', async (req, res) => {
  try {
    const str = String(req.query.url || '');
    const match = str.match(/last\.fm\/music\/([^/?]+)\/([^/?]+)/i);
    if (!match) {
      return res.status(400).json({
        error: 'Not a recognizable last.fm album URL (expected .../music/<Artist>/<Album>)',
      });
    }
    const artist = decodeURIComponent(match[1].replace(/\+/g, ' '));
    const album = decodeURIComponent(match[2].replace(/\+/g, ' '));
    const details = await lastfm.getAlbumDetails(db, lastfm.keyFor(artist, album));
    res.json({
      key: details.key,
      title: details.title,
      artist: details.artist,
      year: details.year,
      cover_url: details.cover_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
