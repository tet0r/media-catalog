import { useEffect, useState } from 'react';
import { api } from '../api.js';

// "Suggested Movies" for the collection pop-over: what TMDB says belongs in
// the same franchise, split by whether it's already in the library (can be
// added right now) or not (just a heads-up of what's missing). See
// server/lib/collectionSuggestions.js for how the suggestions are worked out.
export default function CollectionSuggestions({ collectionId, onAdded }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('library');
  const [busyId, setBusyId] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    return api
      .getCollectionSuggestions(collectionId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [collectionId]);

  async function addNow(item) {
    setBusyId(item.tmdb_id);
    setError(null);
    try {
      const updated = await api.addMovieToCollection(collectionId, item.movie_id);
      setData((prev) => ({ ...prev, in_library: prev.in_library.filter((s) => s.tmdb_id !== item.tmdb_id) }));
      onAdded(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function skip(item, key) {
    setBusyId(item.tmdb_id);
    setError(null);
    try {
      await api.skipCollectionSuggestion(collectionId, item.tmdb_id);
      setData((prev) => ({
        ...prev,
        [key]: prev[key].filter((s) => s.tmdb_id !== item.tmdb_id),
        skipped_count: prev.skipped_count + 1,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function showSkipped() {
    try {
      await api.clearCollectionSuggestionSkips(collectionId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const key = view === 'library' ? 'in_library' : 'not_in_library';
  const items = data ? data[key] : [];

  return (
    <div className="pending-item" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong>Suggested Movies</strong>
        <select value={view} onChange={(e) => setView(e.target.value)} disabled={!data}>
          <option value="library">In your library{data ? ` (${data.in_library.length})` : ''}</option>
          <option value="missing">Not in your library{data ? ` (${data.not_in_library.length})` : ''}</option>
        </select>
      </div>

      {loading && <p className="muted" style={{ marginTop: 10 }}>Looking for suggestions...</p>}
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}

      {data && !loading && (
        <>
          {data.sources.length > 0 && <p className="muted" style={{ marginTop: 10 }}>Based on TMDB’s {data.sources.join(', ')}.</p>}
          {data.sources.length === 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              No suggestions — nothing in this collection belongs to a TMDB franchise yet, and its name doesn’t match one.
            </p>
          )}
          {data.sources.length > 0 && items.length === 0 && (
            <p className="muted">
              {view === 'library'
                ? 'No movies in your library are missing from this collection.'
                : 'Every movie TMDB lists for this franchise is already in your library.'}
            </p>
          )}
          {items.length > 0 && (
            <div className="suggestion-list">
              {items.map((s) => (
                <div key={s.tmdb_id} className="candidate">
                  {s.poster_url ? <img src={s.poster_url} alt="" /> : null}
                  <span style={{ flex: 1 }}>{s.title} {s.year ? `(${s.year})` : ''}</span>
                  {view === 'library' && (
                    <button disabled={busyId === s.tmdb_id} onClick={() => addNow(s)}>
                      {busyId === s.tmdb_id ? 'Adding...' : 'Add Now'}
                    </button>
                  )}
                  <button className="muted-btn" disabled={busyId === s.tmdb_id} onClick={() => skip(s, key)}>
                    Skip
                  </button>
                </div>
              ))}
            </div>
          )}
          {data.skipped_count > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              {data.skipped_count} skipped.{' '}
              <button type="button" className="muted-btn" onClick={showSkipped}>Show skipped again</button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
