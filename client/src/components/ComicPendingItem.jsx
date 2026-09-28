import { useState } from 'react';
import { api } from '../api.js';
import ZoomableImage from './ZoomableImage.jsx';

const SOURCES = [
  { key: 'comicvine', label: 'ComicVine', search: api.searchComicVine },
  { key: 'metron', label: 'Metron', search: api.searchMetron },
  { key: 'gcd', label: 'GCD', search: api.searchGCD },
];
const LABEL_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s.label]));

function Candidate({ c, busy, onUse }) {
  return (
    <div className="candidate">
      {c.cover_url ? <ZoomableImage src={c.cover_url} alt={c.title} /> : null}
      <span>
        {c.series} #{c.issue_number}{c.year ? ` (${c.year})` : ''}
        {' '}
        <span className="muted">— {LABEL_BY_KEY[c.source] || c.source}</span>
      </span>
      <button disabled={busy} onClick={onUse}>Use this</button>
    </div>
  );
}

export default function ComicPendingItem({ item, busy, onResolve, onIgnore, selected, onToggleSelect }) {
  const guessedQuery = item.guessed_series
    ? `${item.guessed_series}${item.guessed_issue_number ? ` #${item.guessed_issue_number}` : ''}`
    : '';
  const [query, setQuery] = useState(guessedQuery);
  // What the scan itself found — often a merge across more than one source
  // (see comicSources.js: it tries ComicVine, then Metron, then GCD until
  // one is confident), so each candidate carries its own `source` tag
  // rather than this list belonging to a single tab.
  const foundCandidates = item.candidates;
  // Search again for something the scan didn't already find, one source at
  // a time — same three-catalog split as AddComic.jsx/ComicDetail.jsx.
  const [activeKey, setActiveKey] = useState(item.source || SOURCES[0].key);
  const [searchedByKey, setSearchedByKey] = useState({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  const active = SOURCES.find((s) => s.key === activeKey);
  const searched = searchedByKey[activeKey];

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const c = await active.search(query);
      setSearchedByKey((prev) => ({ ...prev, [activeKey]: c }));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  function use(candidate) {
    onResolve(candidate.id, false, candidate.source);
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

      <div className="candidates">
        {foundCandidates.length === 0 && <span className="muted">No matches found during the scan.</span>}
        {foundCandidates.map((c) => (
          <Candidate key={`${c.source}-${c.id}`} c={c} busy={busy} onUse={() => use(c)} />
        ))}
      </div>

      <p className="muted" style={{ marginTop: 10 }}>Not the right one? Search again:</p>

      <div className="picker-tabs" style={{ marginBottom: 10 }}>
        {SOURCES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`picker-tab${s.key === activeKey ? ' active' : ''}`}
            onClick={() => setActiveKey(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={search} className="pending-search-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Series name and issue #, e.g. Batman 5" />
        <button type="submit" disabled={working}>{working ? 'Searching...' : 'Search'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {searched && (
        <div className="candidates">
          {searched.length === 0 && <span className="muted">No {active.label} matches found.</span>}
          {searched.map((c) => (
            <Candidate key={`${c.source}-${c.id}`} c={c} busy={busy} onUse={() => use(c)} />
          ))}
        </div>
      )}

      <div className="candidates">
        <button
          className="muted-btn"
          disabled={busy}
          title="Dismiss for now — this file will show up again on the next scan"
          onClick={() => onResolve(null, true, activeKey)}
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
