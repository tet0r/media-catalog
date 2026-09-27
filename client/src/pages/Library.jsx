import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MovieCard from '../components/MovieCard.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';
import BulkAddToCollectionModal from '../components/BulkAddToCollectionModal.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Module-level, not state: Library unmounts when you navigate to a movie
// (it's a separate route), so anything in component state would be lost by
// the time you come back. This survives that as long as the tab itself
// isn't reloaded. (Search/rating/sort don't need this trick — they live in
// App, which never unmounts.)
let savedScrollY = 0;

function letterFor(title) {
  const ch = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export default function Library({ q, rating, sort, dir, onSortChange }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [showAddToCollection, setShowAddToCollection] = useState(false);

  const refreshMovies = useCallback(() => {
    setLoading(true);
    api
      .listMovies({ q, rating, sort, dir })
      .then(setMovies)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, rating, sort, dir]);

  // Track continuously while mounted, not just on unmount — by the time an
  // unmount cleanup runs, the browser may have already clamped window.scrollY
  // down to fit the new (often shorter) page that's replacing this one, so
  // reading it there gives the wrong number.
  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshMovies();
  }, [refreshMovies]);

  useEffect(() => {
    if (loading) return;

    // Restore where the user left off, exactly once per mount — this
    // effect otherwise re-fires whenever a filter change flips `loading`
    // back to false, which would wrongly re-snap the page to the old
    // position mid-session.
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
  }, [movies, loading, sort, pendingJump]);

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
    refreshMovies();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} movie${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteMovie, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshMovie, 'Refreshing');
  }

  const availableLetters = new Set(movies.map((m) => letterFor(m.title)));
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
              { key: 'collection', label: 'Add to Collection', onClick: () => setShowAddToCollection(true) },
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
      ) : movies.length === 0 ? (
        <p className="empty">
          No movies yet. Use "Add Movie" to search by title, or "Scan Library" to import from your movie folder.
        </p>
      ) : (
        <div className="grid">
          {movies.map((m) => {
            const letter = letterFor(m.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            const anchorId = isFirst ? `letter-${letter}` : undefined;
            if (sel.selectMode) {
              return (
                <MovieCard
                  key={m.id}
                  id={anchorId}
                  movie={m}
                  selectMode
                  selected={sel.selectedIds.has(m.id)}
                  onToggleSelect={() => sel.toggle(m.id)}
                />
              );
            }
            return (
              <Link key={m.id} to={`/movies/${m.id}`} id={anchorId}>
                <MovieCard movie={m} />
              </Link>
            );
          })}
        </div>
      )}
      <p className="count">{movies.length} movie{movies.length === 1 ? '' : 's'}</p>

      {movies.length > 0 && (
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

      {showAddToCollection && (
        <BulkAddToCollectionModal
          movieIds={[...sel.selectedIds]}
          onClose={() => setShowAddToCollection(false)}
          onDone={() => {
            setShowAddToCollection(false);
            sel.exitSelectMode();
          }}
        />
      )}
    </div>
  );
}
