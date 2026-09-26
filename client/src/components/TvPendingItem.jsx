import { useState } from 'react';
import { api } from '../api.js';
import ZoomableImage from './ZoomableImage.jsx';

export default function TvPendingItem({ item, busy, onResolve, onIgnore, selected, onToggleSelect }) {
  const [query, setQuery] = useState(item.guessed_title || '');
  const [year, setYear] = useState(item.guessed_year || '');
  const [candidates, setCandidates] = useState(item.candidates);
  const [tvdbUrl, setTvdbUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setCandidates(await api.searchTvdb(query, year));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function lookupUrl(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const result = await api.lookupTvdbUrl(tvdbUrl);
      setCandidates((c) => [result, ...c.filter((existing) => existing.tvdb_id !== result.tvdb_id)]);
      setTvdbUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="pending-item">
      <label className="pending-select-row">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => {}}
          onClick={(e) => {
            e.preventDefault();
            onToggleSelect(e.shiftKey);
          }}
        />
        <div>
          <div className="pending-file">{item.file_path}</div>
          <div className="pending-guess">
            Guessed: {item.guessed_title} {item.guessed_year ? `(${item.guessed_year})` : ''}
          </div>
        </div>
      </label>

      <form onSubmit={search} className="pending-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title" />
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Year"
          style={{ width: 80 }}
        />
        <button type="submit" disabled={working}>{working ? 'Searching...' : 'Search'}</button>
      </form>

      <form onSubmit={lookupUrl} className="pending-search-row">
        <input
          value={tvdbUrl}
          onChange={(e) => setTvdbUrl(e.target.value)}
          placeholder="Or paste a thetvdb.com or imdb.com series URL"
        />
        <button type="submit" disabled={working || !tvdbUrl}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {candidates.length === 0 && <span className="muted">No TheTVDB matches found.</span>}
        {candidates.map((c) => (
          <div key={c.tvdb_id} className="candidate">
            {c.poster_url ? <ZoomableImage src={c.poster_url} alt={c.title} /> : null}
            <span>{c.title} ({c.year})</span>
            <button disabled={busy} onClick={() => onResolve(c.tvdb_id, false)}>
              Use this
            </button>
          </div>
        ))}
        <button
          className="muted-btn"
          disabled={busy}
          title="Dismiss for now — this folder will show up again on the next scan"
          onClick={() => onResolve(null, true)}
        >
          Skip this folder
        </button>
        <button
          className="muted-btn"
          disabled={busy}
          title="Never show this folder again in future scans"
          onClick={onIgnore}
        >
          Ignore
        </button>
      </div>
    </div>
  );
}
