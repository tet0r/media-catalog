import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import CoverImage from '../components/CoverImage.jsx';

export default function AddAlbum() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [mbUrl, setMbUrl] = useState('');
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  const navigate = useNavigate();

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchMusicBrainz(query));
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
      const result = await api.lookupMusicBrainzUrl(mbUrl);
      setResults((r) => [result, ...r.filter((existing) => existing.key !== result.key)]);
      setMbUrl('');
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
      const album = await api.addAlbum({ external_id: key });
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
      <form onSubmit={search} className="toolbar">
        <input placeholder="Album or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>
      <form onSubmit={lookupUrl} className="toolbar">
        <input
          placeholder="Not finding it? Paste a musicbrainz.org release-group URL instead"
          value={mbUrl}
          onChange={(e) => setMbUrl(e.target.value)}
        />
        <button type="submit" disabled={searching || !mbUrl}>Look up URL</button>
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
