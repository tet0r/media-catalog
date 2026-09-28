import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ZoomableImage from '../components/ZoomableImage.jsx';

// Three independent catalogs, same reasoning as AddAlbum.jsx's Last.fm +
// MusicBrainz split — ComicVine's rate limits (see CHANGELOG v18.2) meant
// a search could fail even when the comic is easy to find elsewhere.
// ComicVine is first/default since scanning still tries it first (see
// lib/comicSources.js); each tab keeps its own results so switching back
// and forth doesn't lose what you already found.
const SOURCES = [
  { key: 'comicvine', label: 'ComicVine', search: api.searchComicVine, lookupUrl: api.lookupComicVineUrl, urlPlaceholder: 'Paste a comicvine.gamespot.com issue URL' },
  { key: 'metron', label: 'Metron', search: api.searchMetron },
  { key: 'gcd', label: 'GCD', search: api.searchGCD },
];

export default function AddComic() {
  const [activeKey, setActiveKey] = useState(SOURCES[0].key);
  const [query, setQuery] = useState('');
  const [resultsByKey, setResultsByKey] = useState({});
  const [urlByKey, setUrlByKey] = useState({});
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
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
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing.id !== result.id)],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addComic(candidate) {
    setAddingId(candidate.id);
    setError(null);
    try {
      const comic = await api.addComic({ issue_id: candidate.id, source: candidate.source });
      navigate(`/comics/${comic.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div>
      <h1>Add Comic</h1>
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
        <input placeholder="Series name and issue #, e.g. Batman 5" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      {active.lookupUrl && (
        <form onSubmit={lookupUrl} className="toolbar">
          <input
            placeholder={`Not finding it? ${active.urlPlaceholder} instead`}
            value={urlByKey[activeKey] || ''}
            onChange={(e) => setUrlByKey((prev) => ({ ...prev, [activeKey]: e.target.value }))}
          />
          <button type="submit" disabled={searching || !(urlByKey[activeKey] || '')}>Look up URL</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.id} className="card search-result">
            <div className="poster cover">
              {r.cover_url ? <ZoomableImage src={r.cover_url} alt={r.title} /> : <div className="no-poster">{r.title || r.series}</div>}
            </div>
            <div className="card-title">{r.series}</div>
            <div className="card-meta">#{r.issue_number}{r.year ? ` (${r.year})` : ''}</div>
            <button onClick={() => addComic(r)} disabled={addingId === r.id}>
              {addingId === r.id ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
