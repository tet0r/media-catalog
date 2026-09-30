import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import GameCard from '../components/GameCard.jsx';
import GroupCard from '../components/GroupCard.jsx';
import GroupDetailModal from '../components/GroupDetailModal.jsx';
import MergeGroupsModal from '../components/MergeGroupsModal.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

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
  const sel = useBulkSelection();
  const groupSel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [openPlatform, setOpenPlatform] = useState(null);
  const [platformImages, setPlatformImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshList = useCallback(() => {
    setLoading(true);
    api
      .listGames({ q, sort, dir })
      .then(setGames)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshPlatformImages = useCallback(() => {
    api.listGamePlatformImages().then(setPlatformImages).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPlatformImages();
  }, [refreshPlatformImages]);

  async function renamePlatform(oldName, newName) {
    await api.renameGamePlatforms([oldName], newName);
    if (openPlatform === oldName) setOpenPlatform(newName);
    refreshList();
    refreshPlatformImages();
  }

  async function uploadPlatformCover(platformName, file) {
    await api.uploadGamePlatformCover(platformName, file);
    refreshPlatformImages();
  }

  async function setPlatformCoverUrl(platformName, url) {
    await api.setGamePlatformCover(platformName, url);
    refreshPlatformImages();
  }

  function platformImageSearchTabs(platformName) {
    return [
      { key: 'wikipedia', label: 'Wikipedia', sourceLabel: 'No free, keyless platform-art API exists, so this is the only source — works for almost any well-known console/platform.', fetchOptions: () => api.searchGamePlatformImages(platformName) },
    ];
  }

  async function mergePlatforms(targetName) {
    await api.renameGamePlatforms([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshList();
    refreshPlatformImages();
  }

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

  // Sequential, not Promise.all — a burst of concurrent requests against
  // the same sqlite connection is worth avoiding regardless of count.
  async function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} game${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ done: i, total: ids.length, label: 'Deleting' });
      try { await api.deleteGame(ids[i]); } catch { /* keep going for the rest */ }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    sel.exitSelectMode();
    refreshList();
  }

  const groups = groupByPlatform ? groupByPlatformName(games) : null;
  const openGroup = openPlatform && groups ? groups.find((g) => g.platform === openPlatform) : null;
  const availableLetters = new Set(
    groupByPlatform ? groups.map((g) => g.letter) : games.map((g) => letterFor(g.title))
  );
  const seenLetters = new Set();

  function renderCard(game, anchorId) {
    if (sel.selectMode) {
      return (
        <GameCard
          key={game.id}
          id={anchorId}
          game={game}
          selectMode
          selected={sel.selectedIds.has(game.id)}
          onToggleSelect={() => sel.toggle(game.id)}
        />
      );
    }
    return (
      <Link key={game.id} to={`/games/${game.id}`} id={anchorId}>
        <GameCard game={game} />
      </Link>
    );
  }

  return (
    <div className="library-page">
      {groupByPlatform ? (
        <groupSel.Portal>
          <button
            type="button"
            className={`toolbar-toggle${groupSel.selectMode ? ' active' : ''}`}
            onClick={() => (groupSel.selectMode ? groupSel.exitSelectMode() : groupSel.setSelectMode(true))}
          >
            Select Groups
          </button>
          {groupSel.selectMode && groupSel.selectedIds.size >= 2 && (
            <button type="button" onClick={() => setMergeModalOpen(true)}>
              Merge {groupSel.selectedIds.size} Groups
            </button>
          )}
        </groupSel.Portal>
      ) : (
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
              actions={[{ key: 'delete', label: 'Delete Selected', onClick: bulkDelete, danger: true }]}
            />
          )}
        </sel.Portal>
      )}

      {bulkProgress && (
        <p className="muted">{bulkProgress.label}... ({bulkProgress.done}/{bulkProgress.total})</p>
      )}
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
        <div className="grid">
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <GroupCard
                key={g.platform}
                id={isFirst ? `letter-${g.letter}` : undefined}
                label={g.platform}
                count={g.items.length}
                countLabel="game"
                coverUrls={g.items.map((game) => game.cover_url)}
                customImageUrl={platformImages[g.platform]}
                onClick={() => setOpenPlatform(g.platform)}
                selectMode={groupSel.selectMode}
                selected={groupSel.selectedIds.has(g.platform)}
                onToggleSelect={() => groupSel.toggle(g.platform)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {games.map((game) => {
            const letter = letterFor(game.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(game, isFirst ? `letter-${letter}` : undefined);
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

      {openGroup && (
        <GroupDetailModal
          label={openGroup.platform}
          count={openGroup.items.length}
          countLabel="game"
          coverUrls={openGroup.items.map((game) => game.cover_url)}
          customImageUrl={platformImages[openGroup.platform]}
          onClose={() => setOpenPlatform(null)}
          onRename={(newName) => renamePlatform(openGroup.platform, newName)}
          onUploadCover={(file) => uploadPlatformCover(openGroup.platform, file)}
          onSetCoverUrl={(url) => setPlatformCoverUrl(openGroup.platform, url)}
          imageSearchTabs={platformImageSearchTabs(openGroup.platform)}
        >
          {openGroup.items.map((game) => renderCard(game, undefined))}
        </GroupDetailModal>
      )}

      {mergeModalOpen && (
        <MergeGroupsModal
          sourceNames={[...groupSel.selectedIds]}
          onMerge={mergePlatforms}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
