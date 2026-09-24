import { useState } from 'react';
import { api } from '../api.js';
import CoverImage from './CoverImage.jsx';

const SOURCES = [
  { key: 'musicbrainz', label: 'MusicBrainz', search: api.searchMusicBrainz, lookupUrl: api.lookupMusicBrainzUrl, urlPlaceholder: 'Paste a musicbrainz.org release-group URL' },
  { key: 'lastfm', label: 'Last.fm', search: api.searchLastfm, lookupUrl: api.lookupLastfmUrl, urlPlaceholder: 'Paste a last.fm album URL' },
];

export default function AlbumPendingItem({ item, busy, onResolve, onIgnore, selected, onToggleSelect }) {
  const [activeKey, setActiveKey] = useState(SOURCES[0].key);
  const [query, setQuery] = useState(
    [item.guessed_album, item.guessed_artist].filter(Boolean).join(' ')
  );
  // The scan's own automatic search only ever tries MusicBrainz, so that's
  // the only tab pre-populated with results; Last.fm starts empty until
  // searched here.
  const [candidatesByKey, setCandidatesByKey] = useState({ musicbrainz: item.candidates || [] });
  const [urlByKey, setUrlByKey] = useState({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  const active = SOURCES.find((s) => s.key === activeKey);
  const candidates = candidatesByKey[activeKey] || [];

  async function search(e) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const c = await active.search(query);
      setCandidatesByKey((prev) => ({ ...prev, [activeKey]: c }));
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
      const result = await active.lookupUrl(urlByKey[activeKey] || '');
      setCandidatesByKey((prev) => ({
        ...prev,
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing.key !== result.key)],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
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
            // ScanAlbums.jsx) rather than the checkbox's own native toggle,
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
            Guessed: {item.guessed_album}{item.guessed_artist ? ` by ${item.guessed_artist}` : ''}
          </div>
        </div>
      </label>

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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search album or artist" />
        <button type="submit" disabled={working}>{working ? 'Searching...' : 'Search'}</button>
      </form>

      <form onSubmit={lookupUrl} className="pending-search-row">
        <input
          value={urlByKey[activeKey] || ''}
          onChange={(e) => setUrlByKey((prev) => ({ ...prev, [activeKey]: e.target.value }))}
          placeholder={`Or ${active.urlPlaceholder.toLowerCase()}`}
        />
        <button type="submit" disabled={working || !(urlByKey[activeKey] || '')}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {candidates.length === 0 && <span className="muted">No {active.label} matches found.</span>}
        {candidates.map((c) => (
          <div key={c.key} className="candidate">
            <CoverImage url={c.cover_url} alt={c.title} />
            <span>{c.title} — {c.artist}{c.year ? ` (${c.year})` : ''}</span>
            <button disabled={busy} onClick={() => onResolve(c.key, false, activeKey)}>
              Use this
            </button>
          </div>
        ))}
        <button
          className="muted-btn"
          disabled={busy}
          title="Dismiss for now — this folder will show up again on the next scan"
          onClick={() => onResolve(null, true, activeKey)}
        >
          Skip this
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
