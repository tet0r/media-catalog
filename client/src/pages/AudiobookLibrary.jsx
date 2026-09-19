import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AudiobookCard from '../components/AudiobookCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx: scroll position is a DOM concern this page
// still has to track itself, even though q/sort/dir now live in App.
let savedScrollY = 0;

function letterFor(title) {
  const ch = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

export default function AudiobookLibrary({ q, sort, dir, onSortChange }) {
  const [audiobooks, setAudiobooks] = useState([]);
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
      .listAudiobooks({ q, sort, dir })
      .then(setAudiobooks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

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
  }, [audiobooks, loading, sort, pendingJump]);

  function jumpTo(letter) {
    if (sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const availableLetters = new Set(audiobooks.map((a) => letterFor(a.title)));
  const seenLetters = new Set();

  return (
    <div className="library-page">
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : audiobooks.length === 0 ? (
        <p className="empty">
          No audiobooks yet. Use "Add Audiobook" to search by title, or "Scan Library" to import from your audiobook folder.
        </p>
      ) : (
        <div className="grid">
          {audiobooks.map((a) => {
            const letter = letterFor(a.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return (
              <Link key={a.id} to={`/audiobooks/${a.id}`} id={isFirst ? `letter-${letter}` : undefined}>
                <AudiobookCard audiobook={a} />
              </Link>
            );
          })}
        </div>
      )}
      <p className="count">{audiobooks.length} audiobook{audiobooks.length === 1 ? '' : 's'}</p>

      {audiobooks.length > 0 && (
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
