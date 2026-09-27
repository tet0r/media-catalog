import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddComic() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [cvUrl, setCvUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchComicVine(query));
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
      const result = await api.lookupComicVineUrl(cvUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.id !== result.id)]);
      setCvUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addComic(issueId) {
    setAddingId(issueId);
    setError(null);
    try {
      const comic = await api.addComic({ issue_id: issueId });
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
      <form onSubmit={search} className="toolbar">
        <input placeholder="Series name and issue #, e.g. Batman 5" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste a comicvine.gamespot.com issue URL instead"
          value={cvUrl}
          onChange={(e) => setCvUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !cvUrl}>Look up URL</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.id} className="card search-result">
            <div className="poster cover">
              {r.cover_url ? <img src={r.cover_url} alt={r.title} /> : <div className="no-poster">{r.title}</div>}
            </div>
            <div className="card-title">{r.series}</div>
            <div className="card-meta">#{r.issue_number}{r.year ? ` (${r.year})` : ''}</div>
            <button onClick={() => addComic(r.id)} disabled={addingId === r.id}>
              {addingId === r.id ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
