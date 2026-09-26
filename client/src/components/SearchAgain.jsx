import { useState } from 'react';

// Lets a wrong match be fixed without deleting and re-adding the item —
// searches fresh, right on the item's own detail page, and re-points it at
// whichever result is picked. Generic across every scanned media type
// (Movies, Audiobooks, Ebooks, Albums, TV) since the only real differences
// are which source(s) to search and how to render a candidate.
//
// `sources`: [{ key, label, search(query), lookupUrl(url), urlPlaceholder }]
// — the tab bar only renders when there's more than one.
// `idField`: the candidate field that uniquely identifies it (e.g.
// "tmdb_id", "key", "asin").
// `imageField`: the candidate field with its cover/poster URL.
// `renderLabel(candidate)`: text describing the candidate.
// `rematch(sourceKey, idValue)`: performs the actual API call and returns
// the updated item; this component doesn't know the endpoint shape.
export default function SearchAgain({
  sources,
  queryPlaceholder,
  idField,
  imageField,
  renderLabel,
  rematch,
  onRematched,
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(sources[0].key);
  const [query, setQuery] = useState('');
  const [resultsByKey, setResultsByKey] = useState({});
  const [urlByKey, setUrlByKey] = useState({});
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [applyingId, setApplyingId] = useState(null);

  const active = sources.find((s) => s.key === activeKey);
  const results = resultsByKey[activeKey] || [];

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await active.search(query);
      setResultsByKey((prev) => ({ ...prev, [activeKey]: r }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function lookupUrl(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const result = await active.lookupUrl(urlByKey[activeKey] || '');
      setResultsByKey((prev) => ({
        ...prev,
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing[idField] !== result[idField])],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function apply(candidate) {
    const idValue = candidate[idField];
    setApplyingId(idValue);
    setError(null);
    try {
      const updated = await rematch(activeKey, idValue);
      onRematched(updated);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingId(null);
    }
  }

  if (!open) {
    return (
      <button className="muted-btn" onClick={() => setOpen(true)}>Search Again</button>
    );
  }

  return (
    <div className="pending-item" style={{ marginTop: 14 }}>
      {sources.length > 1 && (
        <div className="picker-tabs" style={{ marginBottom: 10 }}>
          {sources.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`picker-tab${s.key === activeKey ? ' active' : ''}`}
              onClick={() => setActiveKey(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={search} className="pending-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={queryPlaceholder} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>

      <form onSubmit={lookupUrl} className="pending-search-row">
        <input
          value={urlByKey[activeKey] || ''}
          onChange={(e) => setUrlByKey((prev) => ({ ...prev, [activeKey]: e.target.value }))}
          placeholder={`Or ${active.urlPlaceholder.toLowerCase()}`}
        />
        <button type="submit" disabled={searching || !(urlByKey[activeKey] || '')}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {results.length === 0 && <span className="muted">No {active.label} matches found.</span>}
        {results.map((r) => (
          <div key={r[idField]} className="candidate">
            {r[imageField] ? <img src={r[imageField]} alt="" /> : null}
            <span>{renderLabel(r)}</span>
            <button disabled={applyingId === r[idField]} onClick={() => apply(r)}>
              {applyingId === r[idField] ? 'Applying...' : 'Use this'}
            </button>
          </div>
        ))}
        <button className="muted-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
