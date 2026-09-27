import { useState } from 'react';
import { api } from '../api.js';
import ZoomableImage from './ZoomableImage.jsx';

export default function ComicPendingItem({ item, busy, onResolve, onIgnore, selected, onToggleSelect }) {
  const guessedQuery = item.guessed_series
    ? `${item.guessed_series}${item.guessed_issue_number ? ` #${item.guessed_issue_number}` : ''}`
    : '';
  const [query, setQuery] = useState(guessedQuery);
  const [candidates, setCandidates] = useState(item.candidates);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setCandidates(await api.searchComicVine(query));
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
            // ScanComics.jsx) rather than the checkbox's own native toggle,
            // so a shift-click can select a whole range instead of just
            // this one box — preventDefault stops the native toggle from
            // fighting the controlled `checked` value.
            e.preventDefault();
            onToggleSelect(e.shiftKey);
          }}
        />
        <div>
          <div className="pending-file">{item.file_path}</div>
          <div className="pending-guess">
            Guessed: {item.guessed_series || '(no series guessed)'}
            {item.guessed_issue_number ? ` #${item.guessed_issue_number}` : ' — no issue number guessed'}
          </div>
        </div>
      </label>

      <form onSubmit={search} className="pending-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Series name and issue #, e.g. Batman 5" />
        <button type="submit" disabled={working}>{working ? 'Searching...' : 'Search'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {candidates.length === 0 && <span className="muted">No ComicVine matches found.</span>}
        {candidates.map((c) => (
          <div key={c.id} className="candidate">
            {c.cover_url ? <ZoomableImage src={c.cover_url} alt={c.title} /> : null}
            <span>{c.series} #{c.issue_number}{c.year ? ` (${c.year})` : ''}</span>
            <button disabled={busy} onClick={() => onResolve(c.id, false)}>
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
          Skip this
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
