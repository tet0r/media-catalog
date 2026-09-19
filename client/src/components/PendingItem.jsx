import { useState } from 'react';
import { api } from '../api.js';

export default function PendingItem({ item, busy, onResolve, onIgnore, selected, onToggleSelect }) {
  const [query, setQuery] = useState(item.guessed_title || '');
  const [year, setYear] = useState(item.guessed_year || '');
  const [candidates, setCandidates] = useState(item.candidates);
  const [tmdbUrl, setTmdbUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setCandidates(await api.searchTmdb(query, year));
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
      const result = await api.lookupTmdbUrl(tmdbUrl);
      setCandidates((c) => [result, ...c.filter((existing) => existing.tmdb_id !== result.tmdb_id)]);
      setTmdbUrl('');
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
            // Fully controlled by the parent's selection state (see
            // ScanLibrary.jsx) rather than the checkbox's own native toggle,
            // so a shift-click can select a whole range instead of just this
            // one box — preventDefault stops the native toggle from
            // fighting the controlled `checked` value.
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
          value={tmdbUrl}
          onChange={(e) => setTmdbUrl(e.target.value)}
          placeholder="Or paste a themoviedb.org or imdb.com movie URL"
        />
        <button type="submit" disabled={working || !tmdbUrl}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {candidates.length === 0 && <span className="muted">No TMDB matches found.</span>}
        {candidates.map((c) => (
          <div key={c.tmdb_id} className="candidate">
            {c.poster_url ? <img src={c.poster_url} alt={c.title} /> : null}
            <span>{c.title} ({c.year})</span>
            <button disabled={busy} onClick={() => onResolve(c.tmdb_id, false)}>
              Use this
            </button>
          </div>
        ))}
        <button
          className="muted-btn"
          disabled={busy}
          title="Dismiss for now — this file will show up again on the next scan"
          onClick={() => onResolve(null, true)}
        >
          Skip this file
        </button>
        <button
          className="muted-btn"
          disabled={busy}
          title="Never show this file again in future scans"
          onClick={onIgnore}
        >
          Ignore
        </button>
      </div>
    </div>
  );
}
