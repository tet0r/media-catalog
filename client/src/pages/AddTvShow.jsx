import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddTvShow() {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState([]);
  const [tvdbUrl, setTvdbUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await api.searchTvdb(query, year);
      setResults(r);
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
      const result = await api.lookupTvdbUrl(tvdbUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.tvdb_id !== result.tvdb_id)]);
      setTvdbUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addShow(tvdbId) {
    setAddingId(tvdbId);
    setError(null);
    try {
      const show = await api.addTvShow({ tvdb_id: tvdbId });
      navigate(`/tv/${show.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div>
      <h1>Add TV Show</h1>
      <form onSubmit={search} className="toolbar">
        <input placeholder="Show title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input placeholder="Year (optional)" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 120 }} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste a thetvdb.com or imdb.com series URL instead"
          value={tvdbUrl}
          onChange={(e) => setTvdbUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !tvdbUrl}>Look up URL</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.tvdb_id} className="card search-result">
            <div className="poster">
              {r.poster_url ? <img src={r.poster_url} alt={r.title} /> : <div className="no-poster">{r.title}</div>}
            </div>
            <div className="card-title">{r.title}</div>
            <div className="card-meta">{r.year}</div>
            <button onClick={() => addShow(r.tvdb_id)} disabled={addingId === r.tvdb_id}>
              {addingId === r.tvdb_id ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
