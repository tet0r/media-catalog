import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddMovie() {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState([]);
  const [tmdbUrl, setTmdbUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await api.searchTmdb(query, year);
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
      const result = await api.lookupTmdbUrl(tmdbUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.tmdb_id !== result.tmdb_id)]);
      setTmdbUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addMovie(tmdbId) {
    setAddingId(tmdbId);
    setError(null);
    try {
      const movie = await api.addMovie({ tmdb_id: tmdbId });
      navigate(`/movies/${movie.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div>
      <h1>Add Movie</h1>
      <form onSubmit={search} className="toolbar">
        <input placeholder="Movie title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input placeholder="Year (optional)" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 120 }} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste a themoviedb.org movie URL instead"
          value={tmdbUrl}
          onChange={(e) => setTmdbUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !tmdbUrl}>Look up URL</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {results.map((r) => (
          <div key={r.tmdb_id} className="card search-result">
            <div className="poster">
              {r.poster_url ? <img src={r.poster_url} alt={r.title} /> : <div className="no-poster">{r.title}</div>}
            </div>
            <div className="card-title">{r.title}</div>
            <div className="card-meta">{r.year}</div>
            <button onClick={() => addMovie(r.tmdb_id)} disabled={addingId === r.tmdb_id}>
              {addingId === r.tmdb_id ? 'Adding...' : 'Add to Collection'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
