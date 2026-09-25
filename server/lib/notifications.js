const db = require('../db');

// Kept out of the routes file too — the client needs the same mapping to
// build a link to the added item, so it's easiest to have one canonical
// list of valid media_type values right here.
const MEDIA_TYPES = ['movie', 'audiobook', 'ebook', 'album', 'vinyl', 'game', 'tv'];

// An occasional maintenance action (this app's own scans/syncs), not
// something a user actively curates — cap it so a long-running install
// with frequent auto-scans doesn't grow this table forever. Trimming on
// every insert is cheap since it's always removing at most one row past
// the cap.
const MAX_NOTIFICATIONS = 300;

const insertNotification = db.prepare('INSERT INTO notifications (media_type, item_id, title) VALUES (?, ?, ?)');
const trimOldest = db.prepare(
  'DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY id DESC LIMIT ?)'
);

function addNotification(mediaType, itemId, title) {
  if (!MEDIA_TYPES.includes(mediaType)) throw new Error(`Unknown notification media_type: ${mediaType}`);
  insertNotification.run(mediaType, itemId, title);
  trimOldest.run(MAX_NOTIFICATIONS);
}

module.exports = { addNotification, MEDIA_TYPES };
