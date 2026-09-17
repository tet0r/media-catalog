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

module.exports = router;
