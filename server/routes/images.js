const express = require('express');
const db = require('../db');
const tmdb = require('../lib/tmdb');
const theposterdb = require('../lib/theposterdb');

const router = express.Router();

// Alternate posters via ThePosterDB (unofficial scrape — see lib/theposterdb.js).
router.get('/tpdb-posters', async (req, res) => {
  const { title, year } = req.query;
  if (!title) return res.json({ results: [], warning: null });

  let urls;
  try {
    urls = await theposterdb.getPosterUrls(title, year);
  } catch (err) {
    return res.json({
      results: [],
      warning: `ThePosterDB couldn't be reached (${err.message}). It may be down, or its page layout may have changed in a way this app doesn't handle yet.`,
    });
  }

  if (urls.length === 0 && !(await theposterdb.isHealthy())) {
    return res.json({
      results: [],
      warning:
        "ThePosterDB search doesn't seem to be working right now — a known-good test title (The Matrix, 1999) also returned no posters, which usually means their site layout changed rather than this movie actually having none.",
    });
  }

  // ThePosterDB's image CDN enforces referer-based hotlink protection, so a
  // browser loading these directly (which sends our own origin as referer)
  // gets a 403. Route previews through our own /proxy so the fetch happens
  // server-side with no foreign referer; `url` (the real source, used only
  // when actually saving a pick) is unaffected since that fetch is server-side too.
  const results = urls.map((url) => ({ url, thumbnail_url: `/api/images/proxy?url=${encodeURIComponent(url)}` }));
  res.json({ results, warning: null });
});

// Restricted to the one CDN host it exists for — never a general-purpose
// open proxy (that would be an SSRF risk).
const PROXY_ALLOWED_HOST = 'images.theposterdb.com';

router.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== PROXY_ALLOWED_HOST) {
      return res.status(400).json({ error: 'URL not allowed' });
    }
    const upstream = await fetch(parsed, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!upstream.ok) return res.status(upstream.status).end();
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Alternate backdrops via TMDB's own official images endpoint.
router.get('/backdrops/:tmdbId', async (req, res) => {
  try {
    const data = await tmdb.getMovieImages(db, req.params.tmdbId);
    const backdrops = (data.backdrops || []).map((b) => ({
      url: `${tmdb.IMG_BASE}/w1280${b.file_path}`,
      thumbnail_url: `${tmdb.IMG_BASE}/w300${b.file_path}`,
    }));
    res.json(backdrops);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
