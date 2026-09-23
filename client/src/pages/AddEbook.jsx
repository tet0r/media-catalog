import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddEbook() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [olUrl, setOlUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchOpenLibrary(query));
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
      const result = await api.lookupOpenLibraryUrl(olUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.key !== result.key)]);
      setOlUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addEbook(key) {
    setAddingKey(key);
    setError(null);
    try {
      const book = await api.addEbook({ external_id: key });
      navigate(`/ebooks/${book.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <div>
      <h1>Add Ebook</h1>
      <form onSubmit={search} className="toolbar">
        <input placeholder="Book title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste an openlibrary.org work URL instead"
          value={olUrl}
          onChange={(e) => setOlUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !olUrl}>Look up URL</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.key} className="card search-result">
            <div className="poster cover">
              {r.cover_url ? <img src={r.cover_url} alt={r.title} /> : <div className="no-poster">{r.title}</div>}
            </div>
            <div className="card-title">{r.title}</div>
            <div className="card-meta">{(r.authors || []).join(', ')}{r.year ? ` (${r.year})` : ''}</div>
            <button onClick={() => addEbook(r.key)} disabled={addingKey === r.key}>
              {addingKey === r.key ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
