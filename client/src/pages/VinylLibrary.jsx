import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import VinylCard from '../components/VinylCard.jsx';
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
  const sel = useBulkSelection();
  const groupSel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [openArtist, setOpenArtist] = useState(null);
  const [artistImages, setArtistImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshList = useCallback(() => {
    setLoading(true);
    api
      .listVinyl({ q, sort, dir })
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshArtistImages = useCallback(() => {
    api.listVinylArtistImages().then(setArtistImages).catch(() => {});
  }, []);

  useEffect(() => {
    refreshArtistImages();
  }, [refreshArtistImages]);

  async function renameArtist(oldName, newName) {
    await api.renameVinylArtists([oldName], newName);
    if (openArtist === oldName) setOpenArtist(newName);
    refreshList();
    refreshArtistImages();
  }

  async function uploadArtistCover(artistName, file) {
    await api.uploadVinylArtistCover(artistName, file);
    refreshArtistImages();
  }

  async function setArtistCoverUrl(artistName, url) {
    await api.setVinylArtistCover(artistName, url);
    refreshArtistImages();
  }

  function artistImageSearchTabs(artistName) {
    return [
      { key: 'deezer', label: 'Deezer', sourceLabel: "Via Deezer's artist search.", fetchOptions: () => api.searchVinylArtistImages(artistName) },
      { key: 'wikipedia', label: 'Wikipedia', sourceLabel: 'A general fallback — works for almost any well-known artist.', fetchOptions: () => api.searchVinylArtistImages(artistName, 'wikipedia') },
    ];
  }

  async function mergeArtists(targetName) {
    await api.renameVinylArtists([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshList();
    refreshArtistImages();
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

  // Sequential, not Promise.all — a burst of concurrent requests against
  // the same sqlite connection is worth avoiding regardless of count.
  async function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} record${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ done: i, total: ids.length, label: 'Deleting' });
      try { await api.deleteVinylRecord(ids[i]); } catch { /* keep going for the rest */ }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    sel.exitSelectMode();
    refreshList();
  }

  const groups = groupByArtist ? groupByArtistName(records) : null;
  const openGroup = openArtist && groups ? groups.find((g) => g.artist === openArtist) : null;
  const availableLetters = new Set(
    groupByArtist ? groups.map((g) => g.letter) : records.map((r) => letterFor(r.title))
  );
  const seenLetters = new Set();

  function renderCard(r, anchorId) {
    if (sel.selectMode) {
      return (
        <VinylCard
          key={r.id}
          id={anchorId}
          record={r}
          selectMode
          selected={sel.selectedIds.has(r.id)}
          onToggleSelect={() => sel.toggle(r.id)}
        />
      );
    }
    return (
      <Link key={r.id} to={`/music/vinyl/${r.id}`} id={anchorId}>
        <VinylCard record={r} />
      </Link>
    );
  }

  return (
    <div className="library-page">
      {groupByArtist ? (
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
        <div className="grid">
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <GroupCard
                key={g.artist}
                id={isFirst ? `letter-${g.letter}` : undefined}
                label={g.artist}
                count={g.items.length}
                countLabel="record"
                coverUrls={g.items.map((r) => r.cover_url)}
                customImageUrl={artistImages[g.artist]}
                onClick={() => setOpenArtist(g.artist)}
                selectMode={groupSel.selectMode}
                selected={groupSel.selectedIds.has(g.artist)}
                onToggleSelect={() => groupSel.toggle(g.artist)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {records.map((r) => {
            const letter = letterFor(r.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(r, isFirst ? `letter-${letter}` : undefined);
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

      {openGroup && (
        <GroupDetailModal
          label={openGroup.artist}
          count={openGroup.items.length}
          countLabel="record"
          coverUrls={openGroup.items.map((r) => r.cover_url)}
          customImageUrl={artistImages[openGroup.artist]}
          onClose={() => setOpenArtist(null)}
          onRename={(newName) => renameArtist(openGroup.artist, newName)}
          onUploadCover={(file) => uploadArtistCover(openGroup.artist, file)}
          onSetCoverUrl={(url) => setArtistCoverUrl(openGroup.artist, url)}
          imageSearchTabs={artistImageSearchTabs(openGroup.artist)}
        >
          {openGroup.items.map((r) => renderCard(r, undefined))}
        </GroupDetailModal>
      )}

      {mergeModalOpen && (
        <MergeGroupsModal
          sourceNames={[...groupSel.selectedIds]}
          onMerge={mergeArtists}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
