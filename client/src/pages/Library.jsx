import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MovieCard from '../components/MovieCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Module-level, not state: Library unmounts when you navigate to a movie
// (it's a separate route), so anything in component state would be lost by
// the time you come back. This survives that as long as the tab itself
// isn't reloaded.
let savedScrollY = 0;

function letterFor(title) {
  const ch = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export default function Library() {
  const [movies, setMovies] = useState([]);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState('title');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);

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
    setLoading(true);
    api
      .listMovies({ q, format, sort })
      .then(setMovies)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, format, sort]);

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
      setSort('title');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const availableLetters = new Set(movies.map((m) => letterFor(m.title)));
  const seenLetters = new Set();

  return (
    <div className="library-page">
      <div className="toolbar">
        <input placeholder="Search your collection..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">All formats</option>
          <option value="DVD">DVD</option>
          <option value="Blu-ray">Blu-ray</option>
          <option value="4K UHD">4K UHD</option>
          <option value="Digital">Digital</option>
          <option value="File">File</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="added_at">Recently Added</option>
          <option value="personal_rating">My Rating</option>
          <option value="tmdb_rating">TMDB Rating</option>
        </select>
      </div>
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
            return (
              <Link key={m.id} to={`/movies/${m.id}`} id={isFirst ? `letter-${letter}` : undefined}>
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
    </div>
  );
}
