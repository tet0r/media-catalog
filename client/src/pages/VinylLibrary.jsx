import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import VinylCard from '../components/VinylCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as the other library pages: scroll position is a DOM
// concern this page still has to track itself, even though q/sort/dir now
// live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function groupByArtistName(records) {
  const map = new Map();
  for (const record of records) {
    const artist = record.artist || 'Unknown Artist';
    if (!map.has(artist)) map.set(artist, []);
    map.get(artist).push(record);
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

export default function VinylLibrary({ q, sort, dir, onSortChange, groupByArtist }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);

  const refreshList = useCallback(() => {
    setLoading(true);
    api
      .listVinyl({ q, sort, dir })
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    api.vinylSyncStatus().then(setStatus).catch(() => {});
    const interval = setInterval(() => {
      api
        .vinylSyncStatus()
        .then((s) => {
          setStatus((prev) => {
            // A sync that just finished (running: 1 -> 0) means the list
            // is now stale — reload it once, rather than polling the list
            // itself every 2s the way a file-scan's Needs Review queue
            // does (there's no per-item queue here, just the one status).
            if (prev?.running && !s.running) refreshList();
            return s;
          });
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [refreshList]);

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
  }, [records, loading, sort, groupByArtist, pendingJump]);

  async function startSync() {
    setError(null);
    try {
      await api.startVinylSync();
      const s = await api.vinylSyncStatus();
      setStatus(s);
    } catch (err) {
      setError(err.message);
    }
  }

  function jumpTo(letter) {
    if (!groupByArtist && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const groups = groupByArtist ? groupByArtistName(records) : null;
  const availableLetters = new Set(
    groupByArtist ? groups.map((g) => g.letter) : records.map((r) => letterFor(r.title))
  );
  const seenLetters = new Set();

  return (
    <div className="library-page">
      <p>
        Mirrors your vinyl collection from <a href="https://www.discogs.com" target="_blank" rel="noreferrer">Discogs</a> —
        add a username and personal access token in Settings, then sync. Discogs stays the source of truth: edit your
        collection there, then sync again here.
      </p>
      <button onClick={startSync} disabled={status?.running}>
        {status?.running ? 'Syncing...' : 'Sync from Discogs'}
      </button>
      {status && (
        <div className="scan-status">
          <p>{status.message}</p>
          {status.total_found ? (
            <p>
              {status.total_found} found · {status.added} added · {status.updated} updated
              {status.removed ? <> · {status.removed} removed</> : null}
              {status.errored ? <> · {status.errored} failed</> : null}
            </p>
          ) : null}
          {status.last_run && <p className="muted">Last synced: {new Date(status.last_run).toLocaleString()}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : records.length === 0 ? (
        <p className="empty">
          No vinyl records yet. Add your Discogs username and token in Settings, then click "Sync from Discogs" above.
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
                  {g.items.map((r) => (
                    <Link key={r.id} to={`/music/vinyl/${r.id}`}>
                      <VinylCard record={r} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {records.map((r) => {
            const letter = letterFor(r.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return (
              <Link key={r.id} to={`/music/vinyl/${r.id}`} id={isFirst ? `letter-${letter}` : undefined}>
                <VinylCard record={r} />
              </Link>
            );
          })}
        </div>
      )}
      {records.length > 0 && <p className="count">{records.length} record{records.length === 1 ? '' : 's'}</p>}

      {records.length > 0 && (
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
