import { useState } from 'react';

// Unlike MergeGroupsModal (author/series/artist/platform — plain text
// values with no id of their own), a collection is a real row with an id,
// so merging means picking which one actually survives (its
// collection_movies keep everything folded in, the rest are deleted) —
// not just typing a shared name. Defaults to the collection with the most
// movies, on the assumption that's usually the "main" one a duplicate or
// near-duplicate should fold into.
export default function MergeCollectionsModal({ collections, onMerge, onClose }) {
  const [targetId, setTargetId] = useState(
    [...collections].sort((a, b) => b.movie_count - a.movie_count)[0]?.id
  );
  const [targetName, setTargetName] = useState(
    collections.find((c) => c.id === targetId)?.name || ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function selectTarget(id) {
    setTargetId(id);
    setTargetName(collections.find((c) => c.id === id)?.name || '');
  }

  async function merge(e) {
    e.preventDefault();
    if (!targetName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onMerge(targetId, targetName.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Merge {collections.length} Collections</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>
        <p className="muted">Every movie from the others moves into whichever one you keep below.</p>
        <form onSubmit={merge}>
          {collections.map((c) => (
            <label key={c.id} className="pending-select-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="radio" name="mergeTarget" checked={targetId === c.id} onChange={() => selectTarget(c.id)} />
              <span>{c.name} ({c.movie_count} movie{c.movie_count === 1 ? '' : 's'})</span>
            </label>
          ))}
          <div className="pending-search-row" style={{ marginTop: 10 }}>
            <input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="Merged name" />
            <button type="submit" disabled={busy || !targetName.trim()}>{busy ? 'Merging...' : 'Merge'}</button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
