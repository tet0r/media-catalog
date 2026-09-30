import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AlbumCard from '../components/AlbumCard.jsx';
import GroupCard from '../components/GroupCard.jsx';
import GroupDetailModal from '../components/GroupDetailModal.jsx';
import MergeGroupsModal from '../components/MergeGroupsModal.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

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
  const sel = useBulkSelection();
  const groupSel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [openArtist, setOpenArtist] = useState(null);
  const [artistImages, setArtistImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshAlbums = useCallback(() => {
    setLoading(true);
    api
      .listAlbums({ q, sort, dir })
      .then(setAlbums)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshArtistImages = useCallback(() => {
    api.listAlbumArtistImages().then(setArtistImages).catch(() => {});
  }, []);

  useEffect(() => {
    refreshArtistImages();
  }, [refreshArtistImages]);

  async function renameArtist(oldName, newName) {
    await api.renameAlbumArtists([oldName], newName);
    if (openArtist === oldName) setOpenArtist(newName);
    refreshAlbums();
    refreshArtistImages();
  }

  async function uploadArtistCover(artistName, file) {
    await api.uploadAlbumArtistCover(artistName, file);
    refreshArtistImages();
  }

  async function mergeArtists(targetName) {
    await api.renameAlbumArtists([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshAlbums();
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
    refreshAlbums();
  }, [refreshAlbums]);

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

  // Sequential, not Promise.all — a burst of concurrent requests against
  // the same sqlite connection is worth avoiding regardless of count.
  async function runBulk(ids, actionFn, label) {
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ done: i, total: ids.length, label });
      try { await actionFn(ids[i]); } catch { /* keep going for the rest */ }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    sel.exitSelectMode();
    refreshAlbums();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} album${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteAlbum, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshAlbum, 'Refreshing');
  }

  const groups = groupByArtist ? groupByArtistName(albums) : null;
  const openGroup = openArtist && groups ? groups.find((g) => g.artist === openArtist) : null;
  const availableLetters = new Set(
    groupByArtist ? groups.map((g) => g.letter) : albums.map((a) => letterFor(a.title))
  );
  const seenLetters = new Set();

  function renderCard(a, anchorId) {
    if (sel.selectMode) {
      return (
        <AlbumCard
          key={a.id}
          id={anchorId}
          album={a}
          selectMode
          selected={sel.selectedIds.has(a.id)}
          onToggleSelect={() => sel.toggle(a.id)}
        />
      );
    }
    return (
      <Link key={a.id} to={`/music/albums/${a.id}`} id={anchorId}>
        <AlbumCard album={a} />
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
              actions={[
                { key: 'refresh', label: 'Refresh Metadata', onClick: bulkRefresh },
                { key: 'delete', label: 'Delete Selected', onClick: bulkDelete, danger: true },
              ]}
            />
          )}
        </sel.Portal>
      )}

      {bulkProgress && (
        <p className="muted">{bulkProgress.label}... ({bulkProgress.done}/{bulkProgress.total})</p>
      )}
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : albums.length === 0 ? (
        <p className="empty">
          No albums yet. Use "Add Album" to search by title, or "Scan Library" to import from your music folder.
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
                countLabel="album"
                coverUrls={g.items.map((a) => a.cover_url)}
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
          {albums.map((a) => {
            const letter = letterFor(a.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(a, isFirst ? `letter-${letter}` : undefined);
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

      {openGroup && (
        <GroupDetailModal
          label={openGroup.artist}
          count={openGroup.items.length}
          countLabel="album"
          coverUrls={openGroup.items.map((a) => a.cover_url)}
          customImageUrl={artistImages[openGroup.artist]}
          onClose={() => setOpenArtist(null)}
          onRename={(newName) => renameArtist(openGroup.artist, newName)}
          onUploadCover={(file) => uploadArtistCover(openGroup.artist, file)}
        >
          {openGroup.items.map((a) => renderCard(a, undefined))}
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
