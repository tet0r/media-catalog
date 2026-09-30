import { useState } from 'react';

// Shown when 2+ groups are selected via a library page's "Select Groups"
// mode and "Merge" is clicked. Renaming a single group (GroupDetailModal's
// own edit-name field) is the same underlying operation with one source
// name instead of several — see server/lib/groupRename.js.
export default function MergeGroupsModal({ sourceNames, onMerge, onClose }) {
  // Defaults to the longest name — usually the most "complete"/least
  // abbreviated of the selected variants (e.g. "J.K. Rowling" over "JK
  // Rowling"), a reasonable starting guess the user can still overwrite.
  const [targetName, setTargetName] = useState(
    [...sourceNames].sort((a, b) => b.length - a.length)[0] || ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function merge(e) {
    e.preventDefault();
    if (!targetName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onMerge(targetName.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Merge {sourceNames.length} Groups</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>
        <p className="muted">Merging: {sourceNames.join(', ')}</p>
        <form onSubmit={merge} className="pending-search-row">
          <input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="Merged name" autoFocus />
          <button type="submit" disabled={busy || !targetName.trim()}>{busy ? 'Merging...' : 'Merge'}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
