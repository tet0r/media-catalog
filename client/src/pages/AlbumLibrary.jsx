import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AlbumCard from '../components/AlbumCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as Library.jsx/AudiobookLibrary.jsx/EbookLibrary.jsx:
// scroll position is a DOM concern this page still has to track itself,
// even though q/sort/dir now live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function groupByArtistName(albums) {
  const map = new Map();
  for (const album of albums) {
    const artist = album.artist || 'Unknown Artist';
    if (!map.has(artist)) map.set(artist, []);
    map.get(artist).push(album);
  }
  const groups = [...map.entries()].map(([artist, items]) => ({
    artist,
    items,
    letter: artist === 'Unknown Artist' ? '#' : letterFor(artist),
  }));
  groups.sort((a, b) => {
    if (a.artist === 'Unknown Artist') return 1;
    if (b.artist === 'Unknown Artist') return -1;
    return a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export default function AlbumLibrary({ q, sort, dir, onSortChange, groupByArtist }) {
  const [albums, setAlbums] = useState([]);
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
      .listAlbums({ q, sort, dir })
      .then(setAlbums)
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

    if (pendingJump && (groupByArtist || sort === 'title')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [albums, loading, sort, groupByArtist, pendingJump]);

  function jumpTo(letter) {
    if (!groupByArtist && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const groups = groupByArtist ? groupByArtistName(albums) : null;
  const availableLetters = new Set(
    groupByArtist ? groups.map((g) => g.letter) : albums.map((a) => letterFor(a.title))
  );
  const seenLetters = new Set();

  return (
    <div className="library-page">
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : albums.length === 0 ? (
        <p className="empty">
          No albums yet. Use "Add Album" to search by title, or "Scan Library" to import from your music folder.
        </p>
      ) : groupByArtist ? (
        <div>
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <div key={g.artist} className="author-group" id={isFirst ? `letter-${g.letter}` : undefined}>
                <h2>{g.artist}</h2>
                <div className="grid">
                  {g.items.map((a) => (
                    <Link key={a.id} to={`/music/albums/${a.id}`}>
                      <AlbumCard album={a} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {albums.map((a) => {
            const letter = letterFor(a.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return (
              <Link key={a.id} to={`/music/albums/${a.id}`} id={isFirst ? `letter-${letter}` : undefined}>
                <AlbumCard album={a} />
              </Link>
            );
          })}
        </div>
      )}
      <p className="count">{albums.length} album{albums.length === 1 ? '' : 's'}</p>

      {albums.length > 0 && (
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
