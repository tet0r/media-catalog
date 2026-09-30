import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ComicCard from '../components/ComicCard.jsx';
import GroupCard from '../components/GroupCard.jsx';
import GroupDetailModal from '../components/GroupDetailModal.jsx';
import MergeGroupsModal from '../components/MergeGroupsModal.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';
import BulkActionsMenu from '../components/BulkActionsMenu.jsx';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

// Same module-level scroll-position trick as the other library pages —
// see Library.jsx for why this needs to live outside component state.
let savedScrollY = 0;

function letterFor(str) {
  const ch = (str || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function groupBySeriesName(comics) {
  const map = new Map();
  for (const comic of comics) {
    const series = comic.series || 'Unknown Series';
    if (!map.has(series)) map.set(series, []);
    map.get(series).push(comic);
  }
  const groups = [...map.entries()].map(([series, items]) => ({
    series,
    items: items.sort((a, b) => (Number(a.issue_number) || 0) - (Number(b.issue_number) || 0)),
    letter: series === 'Unknown Series' ? '#' : letterFor(series),
  }));
  groups.sort((a, b) => {
    if (a.series === 'Unknown Series') return 1;
    if (b.series === 'Unknown Series') return -1;
    return a.series.localeCompare(b.series, undefined, { sensitivity: 'base' });
  });
  return groups;
}

export default function ComicLibrary({ q, sort, dir, onSortChange, groupBySeries }) {
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const groupSel = useBulkSelection();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [openSeries, setOpenSeries] = useState(null);
  const [seriesImages, setSeriesImages] = useState({});
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const refreshComics = useCallback(() => {
    setLoading(true);
    api
      .listComics({ q, sort, dir })
      .then(setComics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, sort, dir]);

  const refreshSeriesImages = useCallback(() => {
    api.listComicSeriesImages().then(setSeriesImages).catch(() => {});
  }, []);

  useEffect(() => {
    refreshSeriesImages();
  }, [refreshSeriesImages]);

  async function renameSeries(oldName, newName) {
    await api.renameComicSeries([oldName], newName);
    if (openSeries === oldName) setOpenSeries(newName);
    refreshComics();
    refreshSeriesImages();
  }

  async function uploadSeriesCover(seriesName, file) {
    await api.uploadComicSeriesCover(seriesName, file);
    refreshSeriesImages();
  }

  async function setSeriesCoverUrl(seriesName, url) {
    await api.setComicSeriesCover(seriesName, url);
    refreshSeriesImages();
  }

  async function deleteSeriesCover(seriesName) {
    await api.deleteComicSeriesCover(seriesName);
    refreshSeriesImages();
  }

  function seriesImageSearchTabs(seriesName) {
    return [
      { key: 'comicvine', label: 'ComicVine', sourceLabel: "Via ComicVine's own volume search.", fetchOptions: () => api.searchComicSeriesImages(seriesName) },
      { key: 'wikipedia', label: 'Wikipedia', sourceLabel: 'A general fallback — works for almost any well-known series.', fetchOptions: () => api.searchComicSeriesImages(seriesName, 'wikipedia') },
    ];
  }

  async function mergeSeries(targetName) {
    await api.renameComicSeries([...groupSel.selectedIds], targetName);
    groupSel.exitSelectMode();
    setMergeModalOpen(false);
    refreshComics();
    refreshSeriesImages();
  }

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshComics();
  }, [refreshComics]);

  useEffect(() => {
    if (loading) return;

    if (!hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      if (savedScrollY > 0) window.scrollTo(0, savedScrollY);
      return;
    }

    if (pendingJump && (groupBySeries || sort === 'series')) {
      const el = document.getElementById(`letter-${pendingJump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingJump(null);
    }
  }, [comics, loading, sort, groupBySeries, pendingJump]);

  function jumpTo(letter) {
    if (!groupBySeries && sort !== 'series') {
      setPendingJump(letter);
      onSortChange('series', 'asc');
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
    refreshComics();
  }

  function bulkDelete() {
    const ids = [...sel.selectedIds];
    if (!confirm(`Delete ${ids.length} comic${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    runBulk(ids, api.deleteComic, 'Deleting');
  }

  function bulkRefresh() {
    runBulk([...sel.selectedIds], api.refreshComic, 'Refreshing');
  }

  const groups = groupBySeries ? groupBySeriesName(comics) : null;
  const openGroup = openSeries && groups ? groups.find((g) => g.series === openSeries) : null;
  const availableLetters = new Set(
    groupBySeries ? groups.map((g) => g.letter) : comics.map((c) => letterFor(c.series || c.title))
  );
  const seenLetters = new Set();

  function renderCard(c, anchorId) {
    if (sel.selectMode) {
      return (
        <ComicCard
          key={c.id}
          id={anchorId}
          comic={c}
          selectMode
          selected={sel.selectedIds.has(c.id)}
          onToggleSelect={() => sel.toggle(c.id)}
        />
      );
    }
    return (
      <Link key={c.id} to={`/comics/${c.id}`} id={anchorId}>
        <ComicCard comic={c} />
      </Link>
    );
  }

  return (
    <div className="library-page">
      {groupBySeries ? (
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
      ) : comics.length === 0 ? (
        <p className="empty">
          No comics yet. Use "Add Comic" to search by series and issue #, or "Scan Library" to import from your comics folder.
        </p>
      ) : groupBySeries ? (
        <div className="grid">
          {groups.map((g) => {
            const isFirst = !seenLetters.has(g.letter);
            if (isFirst) seenLetters.add(g.letter);
            return (
              <GroupCard
                key={g.series}
                id={isFirst ? `letter-${g.letter}` : undefined}
                label={g.series}
                count={g.items.length}
                countLabel="issue"
                coverUrls={g.items.map((c) => c.cover_url)}
                customImageUrl={seriesImages[g.series]}
                onClick={() => setOpenSeries(g.series)}
                selectMode={groupSel.selectMode}
                selected={groupSel.selectedIds.has(g.series)}
                onToggleSelect={() => groupSel.toggle(g.series)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid">
          {comics.map((c) => {
            const letter = letterFor(c.series || c.title);
            const isFirst = !seenLetters.has(letter);
            if (isFirst) seenLetters.add(letter);
            return renderCard(c, isFirst ? `letter-${letter}` : undefined);
          })}
        </div>
      )}
      <p className="count">{comics.length} comic{comics.length === 1 ? '' : 's'}</p>

      {comics.length > 0 && (
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
          label={openGroup.series}
          count={openGroup.items.length}
          countLabel="issue"
          coverUrls={openGroup.items.map((c) => c.cover_url)}
          customImageUrl={seriesImages[openGroup.series]}
          onClose={() => setOpenSeries(null)}
          onRename={(newName) => renameSeries(openGroup.series, newName)}
          onUploadCover={(file) => uploadSeriesCover(openGroup.series, file)}
          onSetCoverUrl={(url) => setSeriesCoverUrl(openGroup.series, url)}
          onDeleteCover={() => deleteSeriesCover(openGroup.series)}
          imageSearchTabs={seriesImageSearchTabs(openGroup.series)}
        >
          {openGroup.items.map((c) => renderCard(c, undefined))}
        </GroupDetailModal>
      )}

      {mergeModalOpen && (
        <MergeGroupsModal
          sourceNames={[...groupSel.selectedIds]}
          onMerge={mergeSeries}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
