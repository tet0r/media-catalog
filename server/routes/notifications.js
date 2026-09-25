const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications ORDER BY id DESC').all());
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Defined after /:id, but since :id is numeric-only in practice and this
// has no path segment of its own, route order doesn't actually matter
// here the way it does for e.g. /refresh-all vs /:id elsewhere — kept
// last anyway for consistency with the rest of the app's route files.
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM notifications').run();
  res.status(204).end();
});

module.exports = router;
