import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import CollectionCard from '../components/CollectionCard.jsx';
import CollectionDetailModal from '../components/CollectionDetailModal.jsx';
import MergeCollectionsModal from '../components/MergeCollectionsModal.jsx';
import useBulkSelection from '../hooks/useBulkSelection.js';

// Same module-level scroll-position trick as the other library pages —
// see Library.jsx for why this needs to live outside component state.
let savedScrollY = 0;

export default function CollectionsLibrary() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const hasRestoredScroll = useRef(false);
  const sel = useBulkSelection();
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [openCollectionId, setOpenCollectionId] = useState(null);
  // "Refetch Posters" runs on the server (the same job as Settings > Movies >
  // Images, limited to collections); this just starts it and watches.
  const [refetchStatus, setRefetchStatus] = useState(null);
  const refetching = !!refetchStatus?.running && (refetchStatus.types || []).includes('collections');

  const refreshCollections = () => {
    setLoading(true);
    return api.listCollections().then(setCollections).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => {
    function handleScroll() {
      savedScrollY = window.scrollY;
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshCollections();
  }, []);

  useEffect(() => {
    api.refetchImagesStatus().then(setRefetchStatus).catch(() => {});
  }, []);

  // Poll only while a run is going, and reload the grid when it ends so the
  // new posters show up.
  useEffect(() => {
    if (!refetching) return undefined;
    const interval = setInterval(async () => {
      try {
        const status = await api.refetchImagesStatus();
        setRefetchStatus(status);
        if (!status.running) refreshCollections();
      } catch { /* try again on the next tick */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [refetching]);

  async function startRefetch() {
    if (
      !confirm(
        'Re-download the posters of your franchise collections from TMDB?\n\n' +
          'This replaces their current poster — including one you picked or uploaded yourself. ' +
          "Collections you made yourself aren't touched, and anything TMDB can't provide keeps its current poster."
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.startRefetchImages(['collections']);
      setRefetchStatus(await api.refetchImagesStatus());
    } catch (err) {
      setError(err.message);
    }
  }

  async function mergeCollections(targetId, targetName) {
    await api.mergeCollections([...sel.selectedIds], targetId, targetName);
    sel.exitSelectMode();
    setMergeModalOpen(false);
    refreshCollections();
  }

  useEffect(() => {
    if (loading || hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;
    if (savedScrollY > 0) window.scrollTo(0, savedScrollY);
  }, [loading]);

  async function createCollection(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createCollection(newName.trim());
      setNewName('');
      refreshCollections();
      setOpenCollectionId(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="library-page">
      <form onSubmit={createCollection} className="pending-search-row" style={{ marginBottom: 20 }}>
        <input
          placeholder="New collection name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={creating || !newName.trim()}>
          {creating ? 'Creating...' : '+ New Collection'}
        </button>
      </form>

      <sel.Portal>
        <button
          type="button"
          className={`toolbar-toggle${sel.selectMode ? ' active' : ''}`}
          onClick={() => (sel.selectMode ? sel.exitSelectMode() : sel.setSelectMode(true))}
        >
          Select
        </button>
        <button type="button" className="toolbar-toggle" onClick={startRefetch} disabled={!!refetchStatus?.running}>
          {refetching ? 'Refetching...' : 'Refetch Posters'}
        </button>
        {sel.selectMode && sel.selectedIds.size >= 2 && (
          <button type="button" onClick={() => setMergeModalOpen(true)}>
            Merge {sel.selectedIds.size} Collections
          </button>
        )}
      </sel.Portal>

      {error && <p className="error">{error}</p>}
      {refetchStatus?.message && refetchStatus.message !== 'Idle' && (refetchStatus.types || []).includes('collections') && (
        <p className="muted">{refetchStatus.message}</p>
      )}
      {loading ? (
        <p>Loading...</p>
      ) : collections.length === 0 ? (
        <p className="empty">
          No collections yet. Create one above, or add a movie that belongs to a TMDB franchise
          (like Star Wars or Toy Story) and one will show up here automatically.
        </p>
      ) : (
        <>
          <div className="grid">
            {collections.map((c) =>
              sel.selectMode ? (
                <CollectionCard
                  key={c.id}
                  collection={c}
                  selectMode
                  selected={sel.selectedIds.has(c.id)}
                  onToggleSelect={() => sel.toggle(c.id)}
                />
              ) : (
                <div key={c.id} style={{ cursor: 'pointer' }} onClick={() => setOpenCollectionId(c.id)}>
                  <CollectionCard collection={c} />
                </div>
              )
            )}
          </div>
          <p className="count">{collections.length} collection{collections.length === 1 ? '' : 's'}</p>
        </>
      )}

      {mergeModalOpen && (
        <MergeCollectionsModal
          collections={collections.filter((c) => sel.selectedIds.has(c.id))}
          onMerge={mergeCollections}
          onClose={() => setMergeModalOpen(false)}
        />
      )}

      {openCollectionId && (
        <CollectionDetailModal
          id={openCollectionId}
          onClose={() => {
            setOpenCollectionId(null);
            refreshCollections();
          }}
        />
      )}
    </div>
  );
}
