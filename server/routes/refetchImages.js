const express = require('express');
const refetch = require('../lib/refetchImages');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(refetch.getStatus());
});

// Body: { types: ['movies', 'games', ...] } or { types: 'all' }. One run at
// a time across every media type — the sources are rate-limited and a
// second concurrent run would only make both slower.
router.post('/', (req, res) => {
  const { types } = req.body || {};
  const requested = types === 'all' ? refetch.TYPE_ORDER : Array.isArray(types) ? types : [];
  const valid = requested.filter((t) => refetch.TYPE_ORDER.includes(t));
  if (!valid.length) {
    return res.status(400).json({ error: `types must be "all" or a list of: ${refetch.TYPE_ORDER.join(', ')}` });
  }
  if (!refetch.startRefetch(valid)) return res.status(409).json({ error: 'An image refetch is already running' });
  res.status(202).json({ started: true, types: valid });
});

module.exports = router;
