import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// Where a notification's item actually lives, and what to call it —
// mirrors lib/notifications.js's MEDIA_TYPES on the server.
const MEDIA_TYPE_INFO = {
  movie: { label: 'Movie', path: (id) => `/movies/${id}` },
  audiobook: { label: 'Audiobook', path: (id) => `/audiobooks/${id}` },
  ebook: { label: 'Ebook', path: (id) => `/ebooks/${id}` },
  album: { label: 'Album', path: (id) => `/music/albums/${id}` },
  vinyl: { label: 'Vinyl', path: (id) => `/music/vinyl/${id}` },
  game: { label: 'Game', path: (id) => `/games/${id}` },
  tv: { label: 'TV Show', path: (id) => `/tv/${id}` },
};

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const refresh = useCallback(() => {
    api.listNotifications().then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function clearOne(id) {
    setItems((list) => list.filter((n) => n.id !== id));
    try {
      await api.clearNotification(id);
    } catch {
      refresh();
    }
  }

  async function clearAll() {
    setItems([]);
    try {
      await api.clearAllNotifications();
    } catch {
      refresh();
    }
  }

  return (
    <div className="notification-bell" ref={ref}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
      >
        🔔
        {items.length > 0 && <span className="notification-badge">{items.length}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="menu">
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            {items.length > 0 && (
              <button type="button" className="muted-btn" onClick={clearAll}>
                Clear All
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted notification-empty">Nothing new.</p>
          ) : (
            <div className="notification-list">
              {items.map((n) => {
                const info = MEDIA_TYPE_INFO[n.media_type];
                return (
                  <div key={n.id} className="notification-item">
                    <Link
                      to={info ? info.path(n.item_id) : '#'}
                      className="notification-item-link"
                      onClick={() => setOpen(false)}
                    >
                      <span className="notification-item-type">{info?.label || n.media_type}</span>
                      <span className="notification-item-title">{n.title}</span>
                    </Link>
                    <button
                      type="button"
                      className="notification-item-clear"
                      title="Clear this notification"
                      onClick={() => clearOne(n.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
