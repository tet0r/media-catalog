import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import EbookCard from '../components/EbookCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx/AudiobookLibrary.jsx: scroll position is a
// DOM concern this page still has to track itself, even though q/sort/dir
// now live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

// A book can have more than one author; grouping uses just the first
// listed, same convention as AudiobookLibrary.jsx.
function primaryAuthor(book) {
  return (book.authors && book.authors[0]) || null;
}

function groupByAuthorName(ebooks) {
  const map = new Map();
  for (const book of ebooks) {
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

export default function EbookLibrary({ q, sort, dir, onSortChange, groupByAuthor }) {
  const [ebooks, setEbooks] = useState([]);
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
      .listEbooks({ q, sort, dir })
      .then(setEbooks)
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
  }, [ebooks, loading, sort, groupByAuthor, pendingJump]);

  function jumpTo(letter) {
    if (!groupByAuthor && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const groups = groupByAuthor ? groupByAuthorName(ebooks) : null;
  const availableLetters = new Set(
    groupByAuthor ? groups.map((g) => g.letter) : ebooks.map((e) => letterFor(e.title))
  );
  const seenLetters = new Set();

  return (
    <div className="library-page">
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : ebooks.length === 0 ? (
        <p className="empty">
          No ebooks yet. Use "Add Ebook" to search by title, or "Scan Library" to import from your ebook folder.
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
                  {g.books.map((e) => (
                    <Link key={e.id} to={`/ebooks/${e.id}`}>
                      <EbookCard ebook={e} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {ebooks.map((e) => {
            const letter = letterFor(e.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return (
              <Link key={e.id} to={`/ebooks/${e.id}`} id={isFirst ? `letter-${letter}` : undefined}>
                <EbookCard ebook={e} />
              </Link>
            );
          })}
        </div>
      )}
      <p className="count">{ebooks.length} ebook{ebooks.length === 1 ? '' : 's'}</p>

      {ebooks.length > 0 && (
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
