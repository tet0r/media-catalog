import { useState } from 'react';
import { api } from '../api.js';

export default function AudiobookPendingItem({ item, busy, onResolve }) {
  const [query, setQuery] = useState(item.guessed_title || '');
  const [candidates, setCandidates] = useState(item.candidates);
  const [audibleUrl, setAudibleUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setCandidates(await api.searchAudible(query));
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
      const result = await api.lookupAudibleUrl(audibleUrl);
      setCandidates((c) => [result, ...c.filter((existing) => existing.asin !== result.asin)]);
      setAudibleUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="pending-item">
      <div className="pending-file">
        {item.file_path} {item.source_format === 'MP3' ? `(${item.file_parts.length} files)` : ''}
      </div>
      <div className="pending-guess">Guessed: {item.guessed_title}</div>

      <form onSubmit={search} className="pending-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title" />
        <button type="submit" disabled={working}>{working ? 'Searching...' : 'Search'}</button>
      </form>

      <form onSubmit={lookupUrl} className="pending-search-row">
        <input
          value={audibleUrl}
          onChange={(e) => setAudibleUrl(e.target.value)}
          placeholder="Or paste an audible.com product URL"
        />
        <button type="submit" disabled={working || !audibleUrl}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {candidates.length === 0 && <span className="muted">No Audible matches found.</span>}
        {candidates.map((c) => (
          <div key={c.asin} className="candidate">
            {c.cover_url ? <img src={c.cover_url} alt={c.title} /> : null}
            <span>{c.title} — {(c.authors || []).join(', ')}</span>
            <button disabled={busy} onClick={() => onResolve(c.asin, false)}>
              Use this
            </button>
          </div>
        ))}
        <button className="muted-btn" disabled={busy} onClick={() => onResolve(null, true)}>
          Skip this
        </button>
      </div>
    </div>
  );
}
