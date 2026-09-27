import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Same create-or-pick-existing flow as AddToCollectionMenu, but for many
// movies at once instead of one — used by the bulk actions menu on the
// Movies library page. Every collection is offered, including franchise
// ones (adding layers a manual addition on top of TMDB's automatic
// match — see server/lib/collections.js's getMemberMovies).
// addMovieToCollection is INSERT OR IGNORE on the server, so re-adding a
// movie that's already a member is a safe no-op, no need to pre-filter
// per movie the way the single-movie menu does.
export default function BulkAddToCollectionModal({ movieIds, onDone, onClose }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listCollections()
      .then(setCollections)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function addToCollection(collectionId) {
    setBusy(true);
    setError(null);
    try {
      // Sequential, not Promise.all — a burst of concurrent requests
      // against the same sqlite connection is worth avoiding regardless
      // of count, and a handful of awaited calls is plenty fast here.
      for (const id of movieIds) {
        await api.addMovieToCollection(collectionId, id);
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addToExisting(e) {
    e.preventDefault();
    if (!selectedId) return;
    await addToCollection(selectedId);
  }

  async function createAndAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCollection(newName.trim());
      for (const id of movieIds) {
        await api.addMovieToCollection(created.id, id);
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add {movieIds.length} Movie{movieIds.length === 1 ? '' : 's'} to Collection</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>
        {loading ? (
          <p className="muted">Loading collections...</p>
        ) : (
          <>
            {collections.length > 0 && (
              <form onSubmit={addToExisting} className="pending-search-row">
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Choose a collection...</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.type === 'franchise' ? ' (franchise)' : ''}</option>
                  ))}
                </select>
                <button type="submit" disabled={busy || !selectedId}>Add</button>
              </form>
            )}
            <form onSubmit={createAndAdd} className="pending-search-row">
              <input placeholder="Or create a new collection..." value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button type="submit" disabled={busy || !newName.trim()}>Create &amp; Add</button>
            </form>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
