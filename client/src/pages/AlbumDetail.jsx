import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import CoverImage from '../components/CoverImage.jsx';

function lastfmUrl(externalId) {
  try {
    const { artist, album } = JSON.parse(externalId);
    return `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;
  } catch {
    return null;
  }
}

function formatDuration(ms) {
  if (!ms) return null;
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SOURCES = [
  { key: 'lastfm', label: 'Last.fm', search: api.searchLastfm, lookupUrl: api.lookupLastfmUrl, urlPlaceholder: 'Paste a last.fm album URL' },
  { key: 'musicbrainz', label: 'MusicBrainz', search: api.searchMusicBrainz, lookupUrl: api.lookupMusicBrainzUrl, urlPlaceholder: 'Paste a musicbrainz.org release-group URL' },
];

// Lets a wrong match be fixed without deleting and re-adding the album —
// searches either source fresh, right here, and re-points this same
// folder(s) at whichever result is picked.
function SearchAgain({ albumId, onRematched }) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(SOURCES[0].key);
  const [query, setQuery] = useState('');
  const [resultsByKey, setResultsByKey] = useState({});
  const [urlByKey, setUrlByKey] = useState({});
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [applyingKey, setApplyingKey] = useState(null);

  const active = SOURCES.find((s) => s.key === activeKey);
  const results = resultsByKey[activeKey] || [];

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await active.search(query);
      setResultsByKey((prev) => ({ ...prev, [activeKey]: r }));
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
      const result = await active.lookupUrl(urlByKey[activeKey] || '');
      setResultsByKey((prev) => ({
        ...prev,
        [activeKey]: [result, ...(prev[activeKey] || []).filter((existing) => existing.key !== result.key)],
      }));
      setUrlByKey((prev) => ({ ...prev, [activeKey]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function apply(key) {
    setApplyingKey(key);
    setError(null);
    try {
      const updated = await api.rematchAlbum(albumId, { external_id: key, source: activeKey });
      onRematched(updated);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingKey(null);
    }
  }

  if (!open) {
    return (
      <button className="muted-btn" onClick={() => setOpen(true)}>Search Again</button>
    );
  }

  return (
    <div className="pending-item" style={{ marginTop: 14 }}>
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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Album or artist" />
        <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
      </form>

      <form onSubmit={lookupUrl} className="pending-search-row">
        <input
          value={urlByKey[activeKey] || ''}
          onChange={(e) => setUrlByKey((prev) => ({ ...prev, [activeKey]: e.target.value }))}
          placeholder={`Or ${active.urlPlaceholder.toLowerCase()}`}
        />
        <button type="submit" disabled={searching || !(urlByKey[activeKey] || '')}>Look up URL</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="candidates">
        {results.length === 0 && <span className="muted">No {active.label} matches found.</span>}
        {results.map((r) => (
          <div key={r.key} className="candidate">
            <CoverImage url={r.cover_url} alt={r.title} />
            <span>{r.title} — {r.artist}{r.year ? ` (${r.year})` : ''}</span>
            <button disabled={applyingKey === r.key} onClick={() => apply(r.key)}>
              {applyingKey === r.key ? 'Applying...' : 'Use this'}
            </button>
          </div>
        ))}
        <button className="muted-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getAlbum(id).then(setAlbum).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!album) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${album.title}" from your collection? Its folder(s) will be added to Ignored, so a re-scan won't add it back automatically.`)) return;
    await api.deleteAlbum(id);
    navigate('/music/albums');
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setAlbum(await api.refreshAlbum(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setAlbum(await api.uploadAlbumCover(id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const discPaths = album.disc_paths && album.disc_paths.length ? album.disc_paths : (album.file_path ? [album.file_path] : []);

  return (
    <div className="detail">
      <div className="detail-body">
        <div className="detail-poster">
          {album.cover_url ? (
            <img
              src={album.cover_url}
              alt={album.title}
              className="cover clickable"
              title="Click to upload a different cover"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => fileInputRef.current?.click()}>{album.title}</div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleCoverFile}
          />
          <button type="button" className="muted-btn cover-upload-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload Cover...'}
          </button>
        </div>
        <div className="detail-info">
          <h1>
            {album.title} {album.year ? <span className="year">({album.year})</span> : null}
          </h1>
          {album.artist && <p className="director">by {album.artist}</p>}

          <div className="tags">
            {(album.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          {album.tracks && album.tracks.length > 0 && (
            <ol className="tracklist">
              {album.tracks.map((t, i) => (
                <li key={i}>
                  <span>{t.title}</span>
                  {t.length_ms ? <span className="muted"> {formatDuration(t.length_ms)}</span> : null}
                </li>
              ))}
            </ol>
          )}

          {discPaths.length > 0 && (
            <div className="filepaths">
              <strong>Source folder{discPaths.length > 1 ? 's' : ''}:</strong>
              {discPaths.map((p) => (
                <div key={p} className="filepath-line">{p}</div>
              ))}
            </div>
          )}

          <div className="tags">
            {album.external_id && album.metadata_source === 'lastfm' && (
              <a className="tag link-tag" href={lastfmUrl(album.external_id)} target="_blank" rel="noreferrer">
                Last.fm ↗
              </a>
            )}
            {album.external_id && album.metadata_source !== 'lastfm' && (
              <a className="tag link-tag" href={`https://musicbrainz.org/release-group/${album.external_id}`} target="_blank" rel="noreferrer">
                MusicBrainz ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !album.external_id}>
              {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
            </button>
            <SearchAgain albumId={id} onRematched={setAlbum} />
            <button className="danger" onClick={remove}>Remove from Collection</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
