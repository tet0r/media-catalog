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
// paste a themoviedb.org movie page URL and fetch that exact one by ID.
router.get('/tmdb-url', async (req, res) => {
  try {
    const { url } = req.query;
    const match = String(url || '').match(/themoviedb\.org\/movie\/(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Not a recognizable themoviedb.org movie URL (expected .../movie/<id>-...)' });
    }
    const details = await tmdb.getMovieDetails(db, match[1]);
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
