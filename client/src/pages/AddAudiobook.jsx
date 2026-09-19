import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Two independent catalogs, since Audible's own search occasionally misses
// a title Apple Books carries (small press, regional editions, etc.) or
// the reverse. Each tab keeps its own results so switching back and forth
// doesn't lose what you already found.
const SOURCES = [
  { key: 'audible', label: 'Audible', search: api.searchAudible, lookupUrl: api.lookupAudibleUrl, urlPlaceholder: 'Paste an audible.com product URL' },
  { key: 'apple', label: 'Apple Books', search: api.searchApple, lookupUrl: api.lookupAppleUrl, urlPlaceholder: 'Paste a books.apple.com audiobook URL' },
];

export default function AddAudiobook() {
  const [activeKey, setActiveKey] = useState(SOURCES[0].key);
  const [query, setQuery] = useState('');
  const [resultsByKey, setResultsByKey] = useState({});
  const [urlByKey, setUrlByKey] = useState({});
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingAsin, setAddingAsin] = useState(null);
  const navigate = useNavigate();

  const active = SOURCES.find((s) => s.key === activeKey);
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
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing.asin !== result.asin)],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addAudiobook(asin) {
    setAddingAsin(asin);
    setError(null);
    try {
      const book = await api.addAudiobook({ asin, source: activeKey });
      navigate(`/audiobooks/${book.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingAsin(null);
    }
  }

  return (
    <div>
      <h1>Add Audiobook</h1>
      <div className="picker-tabs" style={{ marginBottom: 14 }}>
        {SOURCES.map((s) => (
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
      <form onSubmit={search} className="toolbar">
        <input placeholder="Audiobook title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder={`Not finding it? ${active.urlPlaceholder} instead`}
          value={urlByKey[activeKey] || ''}
          onChange={(e) => setUrlByKey((prev) => ({ ...prev, [activeKey]: e.target.value }))}
        />
        <button type="submit" disabled={searching || !(urlByKey[activeKey] || '')}>Look up URL</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.asin} className="card search-result">
            <div className="poster cover">
              {r.cover_url ? <img src={r.cover_url} alt={r.title} /> : <div className="no-poster">{r.title}</div>}
            </div>
            <div className="card-title">{r.title}</div>
            <div className="card-meta">{(r.authors || []).join(', ')}</div>
            <button onClick={() => addAudiobook(r.asin)} disabled={addingAsin === r.asin}>
              {addingAsin === r.asin ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
