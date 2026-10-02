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

// Games can be grouped two ways — by platform (Nintendo 64, Windows, ...) or
// by storefront (LaunchBox's "Source": Steam, GOG, Epic Games, ...). Both
// behave identically (a text column shared by many games, an optional
// custom picture, rename/merge), so everything that differs between them
// lives here and the rest of the page is written once against `kind`.
const GROUP_KINDS = {
  platform: {
    field: 'platform',
    unknown: 'Unknown Platform',
    listImages: () => api.listGamePlatformImages(),
    rename: (names, target) => api.renameGamePlatforms(names, target),
    upload: (name, file) => api.uploadGamePlatformCover(name, file),
    setUrl: (name, url) => api.setGamePlatformCover(name, url),
    remove: (name) => api.deleteGamePlatformCover(name),
    search: (name) => api.searchGamePlatformImages(name),
    sourceLabel: 'No free, keyless platform-art API exists, so this is the only source — works for almost any well-known console/platform.',
  },
  store: {
    field: 'source',
    unknown: 'No Storefront',
    listImages: () => api.listGameStoreImages(),
    rename: (names, target) => api.renameGameStores(names, target),
    upload: (name, file) => api.uploadGameStoreCover(name, file),
    setUrl: (name, url) => api.setGameStoreCover(name, url),
    remove: (name) => api.deleteGameStoreCover(name),
    search: (name) => api.searchGameStoreImages(name),
    sourceLabel: 'No free, keyless storefront-art API exists, so this is the only source — works for any well-known store like Steam or GOG.',
  },
};

function groupGames(games, kind) {
  const map = new Map();
  for (const game of games) {
    const name = game[kind.field] || kind.unknown;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(game);
  }
  const groups = [...map.entries()].map(([name, items]) => ({
    name,
    items,
    letter: name === kind.unknown ? '#' : letterFor(name),
  }));
  groups.sort((a, b) => {
    if (a.name === kind.unknown) return 1;
    if (b.name === kind.unknown) return -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export default function GamesLibrary({ q, sort, dir, onSortChange, groupBy }) {
  const kind = groupBy ? GROUP_KINDS[groupBy] : null;
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
  const [openName, setOpenName] = useState(null);
  const [groupImages, setGroupImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshList = useCallback(() => {
    setLoading(true);
    api
      .listGames({ q, sort, dir })
      .then(setGames)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshGroupImages = useCallback(() => {
    if (!kind) return;
    kind.listImages().then(setGroupImages).catch(() => {});
  }, [kind]);

  // Switching between Platform and Store grouping (or turning grouping off)
  // starts from a clean slate: a group open under one grouping means
  // nothing under the other, and the previous grouping's custom pictures
  // would otherwise briefly show on the wrong cards.
  useEffect(() => {
    setOpenName(null);
    setGroupImages({});
    groupSel.exitSelectMode();
    refreshGroupImages();
  }, [groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function renameGroup(oldName, newName) {
    await kind.rename([oldName], newName);
    if (openName === oldName) setOpenName(newName);
    refreshList();
    refreshGroupImages();
  }

  async function uploadGroupCover(name, file) {
    await kind.upload(name, file);
    refreshGroupImages();
  }

  async function setGroupCoverUrl(name, url) {
    await kind.setUrl(name, url);
    refreshGroupImages();
  }

  async function deleteGroupCover(name) {
    await kind.remove(name);
    refreshGroupImages();
  }

  function groupImageSearchTabs(name) {
    return [
      { key: 'wikipedia', label: 'Wikipedia', sourceLabel: kind.sourceLabel, fetchOptions: () => kind.search(name) },
    ];
  }

  async function mergeGroups(targetName) {
    await kind.rename([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshList();
    refreshGroupImages();
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

    if (pendingJump && (groupBy || sort === 'title')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [games, loading, sort, groupBy, pendingJump]);

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
    if (!groupBy && sort !== 'title') {
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

  const groups = kind ? groupGames(games, kind) : null;
  const openGroup = openName && groups ? groups.find((g) => g.name === openName) : null;
  const availableLetters = new Set(
    groups ? groups.map((g) => g.letter) : games.map((g) => letterFor(g.title))
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
      {groups ? (
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
      ) : groups ? (
        <div className="grid">
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <GroupCard
                key={g.name}
                id={isFirst ? `letter-${g.letter}` : undefined}
                label={g.name}
                count={g.items.length}
                countLabel="game"
                coverUrls={g.items.map((game) => game.cover_url)}
                customImageUrl={groupImages[g.name]}
                onClick={() => setOpenName(g.name)}
                selectMode={groupSel.selectMode}
                selected={groupSel.selectedIds.has(g.name)}
                onToggleSelect={() => groupSel.toggle(g.name)}
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
          label={openGroup.name}
          count={openGroup.items.length}
          countLabel="game"
          coverUrls={openGroup.items.map((game) => game.cover_url)}
          customImageUrl={groupImages[openGroup.name]}
          onClose={() => setOpenName(null)}
          onRename={(newName) => renameGroup(openGroup.name, newName)}
          onUploadCover={(file) => uploadGroupCover(openGroup.name, file)}
          onSetCoverUrl={(url) => setGroupCoverUrl(openGroup.name, url)}
          onDeleteCover={() => deleteGroupCover(openGroup.name)}
          imageSearchTabs={groupImageSearchTabs(openGroup.name)}
        >
          {openGroup.items.map((game) => renderCard(game, undefined))}
        </GroupDetailModal>
      )}

      {mergeModalOpen && (
        <MergeGroupsModal
          sourceNames={[...groupSel.selectedIds]}
          onMerge={mergeGroups}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
