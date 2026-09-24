import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import CoverImage from '../components/CoverImage.jsx';

// Two independent catalogs, since MusicBrainz's own search occasionally
// misses an album Last.fm carries (or the reverse). Each tab keeps its own
// results so switching back and forth doesn't lose what you already found.
const SOURCES = [
  { key: 'musicbrainz', label: 'MusicBrainz', search: api.searchMusicBrainz, lookupUrl: api.lookupMusicBrainzUrl, urlPlaceholder: 'Paste a musicbrainz.org release-group URL' },
  { key: 'lastfm', label: 'Last.fm', search: api.searchLastfm, lookupUrl: api.lookupLastfmUrl, urlPlaceholder: 'Paste a last.fm album URL' },
];

export default function AddAlbum() {
  const [activeKey, setActiveKey] = useState(SOURCES[0].key);
  const [query, setQuery] = useState('');
  const [resultsByKey, setResultsByKey] = useState({});
  const [urlByKey, setUrlByKey] = useState({});
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
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
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing.key !== result.key)],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addAlbum(key) {
    setAddingKey(key);
    setError(null);
    try {
      const album = await api.addAlbum({ external_id: key, source: activeKey });
      navigate(`/music/albums/${album.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <div>
      <h1>Add Album</h1>
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
        <input placeholder="Album or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <div key={r.key} className="card search-result">
            <div className="poster cover">
              <CoverImage url={r.cover_url} alt={r.title} />
            </div>
            <div className="card-title">{r.title}</div>
            <div className="card-meta">{r.artist}{r.year ? ` (${r.year})` : ''}</div>
            <button onClick={() => addAlbum(r.key)} disabled={addingKey === r.key}>
              {addingKey === r.key ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
