import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Only manual collections are offered here — franchise membership
// is computed automatically (see server/lib/collections.js), so there's
// nothing to "add" a movie to for those; the server already rejects it
// with a 400 if asked.
export default function AddToCollectionMenu({ movie, onAdded }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api.listCollections().then(setCollections).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [open]);

  const memberIds = new Set((movie.collections || []).map((c) => c.id));
  const available = collections.filter((c) => c.type === 'manual' && !memberIds.has(c.id));

  async function addToExisting(e) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMovieToCollection(selectedId, movie.id);
      const added = available.find((c) => c.id === Number(selectedId));
      onAdded(added);
      setOpen(false);
      setSelectedId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCollection(newName.trim());
      await api.addMovieToCollection(created.id, movie.id);
      onAdded(created);
      setOpen(false);
      setNewName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="muted-btn" onClick={() => setOpen(true)}>+ Add to Collection</button>;
  }

  return (
    <div className="pending-item" style={{ marginTop: 14 }}>
      {loading ? (
        <p className="muted">Loading collections...</p>
      ) : (
        <>
          {available.length > 0 && (
            <form onSubmit={addToExisting} className="pending-search-row">
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Choose a collection...</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
          <button className="muted-btn" onClick={() => setOpen(false)}>Cancel</button>
        </>
      )}
    </div>
  );
}
