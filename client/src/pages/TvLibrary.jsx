import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TvShowCard from '../components/TvShowCard.jsx';

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

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listTvShows({ q, rating, sort, dir })
      .then(setShows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, rating, sort, dir]);

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

  const availableLetters = new Set(shows.map((s) => letterFor(s.title)));
  const seenLetters = new Set();

  return (
    <div className="library-page">
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
            return (
              <Link key={s.id} to={`/tv/${s.id}`} id={isFirst ? `letter-${letter}` : undefined}>
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
