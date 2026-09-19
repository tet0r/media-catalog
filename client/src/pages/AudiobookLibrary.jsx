import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AudiobookCard from '../components/AudiobookCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx: scroll position is a DOM concern this page
// still has to track itself, even though q/sort/dir now live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

// A book can have more than one author; grouping uses just the first
// listed (the primary/credited one), same convention as how a shelf of
// physical audiobooks would be sorted by whoever's name is on the spine.
function primaryAuthor(book) {
  return (book.authors && book.authors[0]) || null;
}

// Author groups sorted A-Z by name, with "Unknown Author" (no author data
// at all — e.g. a manually-added book that didn't resolve one) always last
// and bucketed under '#' rather than wherever "U" would otherwise fall, so
// it doesn't get confused for a real name.
function groupByAuthorName(audiobooks) {
  const map = new Map();
  for (const book of audiobooks) {
    const author = primaryAuthor(book) || 'Unknown Author';
    if (!map.has(author)) map.set(author, []);
    map.get(author).push(book);
  }
  const groups = [...map.entries()].map(([author, books]) => ({
    author,
    books,
    letter: author === 'Unknown Author' ? '#' : letterFor(author),
  }));
  groups.sort((a, b) => {
    if (a.author === 'Unknown Author') return 1;
    if (b.author === 'Unknown Author') return -1;
    return a.author.localeCompare(b.author, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export default function AudiobookLibrary({ q, sort, dir, onSortChange, groupByAuthor }) {
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

    if (pendingJump && (groupByAuthor || sort === 'title')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [audiobooks, loading, sort, groupByAuthor, pendingJump]);

  function jumpTo(letter) {
    // Author groups are always alphabetical regardless of the sort field
    // (grouping is a separate axis from item-level sort), so jumping while
    // grouped never needs to force a sort change the way title-jumping
    // does in flat mode.
    if (!groupByAuthor && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const groups = groupByAuthor ? groupByAuthorName(audiobooks) : null;
  const availableLetters = new Set(
    groupByAuthor ? groups.map((g) => g.letter) : audiobooks.map((a) => letterFor(a.title))
  );
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
      ) : groupByAuthor ? (
        <div>
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <div key={g.author} className="author-group" id={isFirst ? `letter-${g.letter}` : undefined}>
                <h2>{g.author}</h2>
                <div className="grid">
                  {g.books.map((a) => (
                    <Link key={a.id} to={`/audiobooks/${a.id}`}>
                      <AudiobookCard audiobook={a} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
