import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddAudiobook() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [audibleUrl, setAudibleUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingAsin, setAddingAsin] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchAudible(query));
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
      const result = await api.lookupAudibleUrl(audibleUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.asin !== result.asin)]);
      setAudibleUrl('');
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
      const book = await api.addAudiobook({ asin });
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
      <form onSubmit={search} className="toolbar">
        <input placeholder="Audiobook title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste an audible.com product URL instead"
          value={audibleUrl}
          onChange={(e) => setAudibleUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !audibleUrl}>Look up URL</button>
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
