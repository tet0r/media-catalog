import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same reasoning as the other library pages: scroll position is a DOM
// concern this page still has to track itself, even though q/sort/dir now
// live in App.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function groupByPlatformName(games) {
  const map = new Map();
  for (const game of games) {
    const platform = game.platform || 'Unknown Platform';
    if (!map.has(platform)) map.set(platform, []);
    map.get(platform).push(game);
  }
  const groups = [...map.entries()].map(([platform, items]) => ({
    platform,
    items,
    letter: platform === 'Unknown Platform' ? '#' : letterFor(platform),
  }));
  groups.sort((a, b) => {
    if (a.platform === 'Unknown Platform') return 1;
    if (b.platform === 'Unknown Platform') return -1;
    return a.platform.localeCompare(b.platform, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export default function GamesLibrary({ q, sort, dir, onSortChange, groupByPlatform }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);

  const refreshList = useCallback(() => {
    setLoading(true);
    api
      .listGames({ q, sort, dir })
      .then(setGames)
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
    api.gamesSyncStatus().then(setStatus).catch(() => {});
    const interval = setInterval(() => {
      api
        .gamesSyncStatus()
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

    if (pendingJump && (groupByPlatform || sort === 'title')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [games, loading, sort, groupByPlatform, pendingJump]);

  async function startSync() {
    setError(null);
    try {
      await api.startGamesSync();
      const s = await api.gamesSyncStatus();
      setStatus(s);
    } catch (err) {
      setError(err.message);
    }
  }

  function jumpTo(letter) {
    if (!groupByPlatform && sort !== 'title') {
      setPendingJump(letter);
      onSortChange('title', 'asc');
      return;
    }
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const groups = groupByPlatform ? groupByPlatformName(games) : null;
  const availableLetters = new Set(
    groupByPlatform ? groups.map((g) => g.letter) : games.map((g) => letterFor(g.title))
  );
  const seenLetters = new Set();

  return (
    <div className="library-page">
      <p>
        Mirrors your game library from a local <a href="https://www.launchbox-app.com" target="_blank" rel="noreferrer">LaunchBox</a>{' '}
        installation — point <code>LAUNCHBOX_DIR</code> at your LaunchBox folder (see README), then sync. LaunchBox stays
        the source of truth: add/edit/remove games there, then sync again here.
      </p>
      <button onClick={startSync} disabled={status?.running}>
        {status?.running ? 'Syncing...' : 'Sync from LaunchBox'}
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
      ) : games.length === 0 ? (
        <p className="empty">
          No games yet. Point <code>LAUNCHBOX_DIR</code> at your LaunchBox folder, then click "Sync from LaunchBox" above.
        </p>
      ) : groupByPlatform ? (
        <div>
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <div key={g.platform} className="author-group" id={isFirst ? `letter-${g.letter}` : undefined}>
                <h2>{g.platform}</h2>
                <div className="grid">
                  {g.items.map((game) => (
                    <Link key={game.id} to={`/games/${game.id}`}>
                      <GameCard game={game} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {games.map((game) => {
            const letter = letterFor(game.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return (
              <Link key={game.id} to={`/games/${game.id}`} id={isFirst ? `letter-${letter}` : undefined}>
                <GameCard game={game} />
              </Link>
            );
          })}
        </div>
      )}
      {games.length > 0 && <p className="count">{games.length} game{games.length === 1 ? '' : 's'}</p>}

      {games.length > 0 && (
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
