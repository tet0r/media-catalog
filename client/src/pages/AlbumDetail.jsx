import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

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
    if (!confirm(`Remove "${album.title}" from your collection?`)) return;
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

          {album.file_path && (
            <div className="filepaths">
              <strong>Source folder:</strong>
              <div className="filepath-line">{album.file_path}</div>
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
            <button className="danger" onClick={remove}>Remove from Collection</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
