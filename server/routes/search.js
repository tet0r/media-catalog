const express = require('express');
const db = require('../db');
const tmdb = require('../lib/tmdb');

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

module.exports = router;
