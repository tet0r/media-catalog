import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TvShowCard from '../components/TvShowCard.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same module-level scroll-position trick as Library.jsx — see there for why.
let savedScrollY = 0;

function letterFor(title) {
  const ch = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export default function TvLibrary({ q, rating, sort, dir, onSortChange }) {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  const refreshShows = useCallback(() => {
    setLoading(true);
    api
      .listTvShows({ q, rating, sort, dir })
      .then(setShows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, rating, sort, dir]);

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshShows();
  }, [refreshShows]);

  useEffect(() => {
    if (loading) return;

    if (!hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      if (savedScrollY > 0) window.scrollTo(0, savedScrollY);
      return;
    }

    if (pendingJump && sort === 'title') {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [shows, loading, sort, pendingJump]);

  function jumpTo(letter) {
    if (sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sequential, not Promise.all — a burst of concurrent requests against
  // the same sqlite connection is worth avoiding regardless of count.
  async function runBulk(ids, actionFn, label) {
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ done: i, total: ids.length, label });
      try { await actionFn(ids[i]); } catch { /* keep going for the rest */ }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    sel.exitSelectMode();
    refreshShows();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} show${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteTvShow, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshTvShow, 'Refreshing');
  }

  const availableLetters = new Set(shows.map((s) => letterFor(s.title)));
  const seenLetters = new Set();

  return (
    <div className="library-page">
      <sel.Portal>
        <button
          type="button"
          className={`toolbar-toggle${sel.selectMode ? ' active' : ''}`}
          onClick={() => (sel.selectMode ? sel.exitSelectMode() : sel.setSelectMode(true))}
        >
          Select
        </button>
        {sel.selectMode && sel.selectedIds.size > 0 && (
          <BulkActionsMenu
            count={sel.selectedIds.size}
            disabled={bulkBusy}
            actions={[
              { key: 'refresh', label: 'Refresh Metadata', onClick: bulkRefresh },
              { key: 'delete', label: 'Delete Selected', onClick: bulkDelete, danger: true },
            ]}
          />
        )}
      </sel.Portal>

      {bulkProgress && (
        <p className="muted">{bulkProgress.label}... ({bulkProgress.done}/{bulkProgress.total})</p>
      )}
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : shows.length === 0 ? (
        <p className="empty">
          No TV shows yet. Use "Add Show" to search by title, or "Scan Library" to import from your TV folder.
        </p>
      ) : (
        <div className="grid">
          {shows.map((s) => {
            const letter = letterFor(s.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            const anchorId = isFirst ? `letter-${letter}` : undefined;
            if (sel.selectMode) {
              return (
                <TvShowCard
                  key={s.id}
                  id={anchorId}
                  show={s}
                  selectMode
                  selected={sel.selectedIds.has(s.id)}
                  onToggleSelect={() => sel.toggle(s.id)}
                />
              );
            }
            return (
              <Link key={s.id} to={`/tv/${s.id}`} id={anchorId}>
                <TvShowCard show={s} />
              </Link>
            );
          })}
        </div>
      )}
      <p className="count">{shows.length} show{shows.length === 1 ? '' : 's'}</p>

      {shows.length > 0 && (
        <nav className="alpha-index" aria-label="Jump to letter">
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              disabled={!availableLetters.has(letter)}
              onClick={() => jumpTo(letter)}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
