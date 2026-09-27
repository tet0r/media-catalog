import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import SearchAgain from '../components/SearchAgain.jsx';

const COMICVINE_SOURCES = [
  {
    key: 'comicvine',
    label: 'ComicVine',
    search: (q) => api.searchComicVine(q),
    lookupUrl: api.lookupComicVineUrl,
    urlPlaceholder: 'Paste a comicvine.gamespot.com issue URL',
  },
];

export default function ComicDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [comic, setComic] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getComic(id).then(setComic).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!comic) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${comic.title}" from your collection?`)) return;
    await api.deleteComic(id);
    navigate('/comics');
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setComic(await api.refreshComic(id));
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
      setComic(await api.uploadComicCover(id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const writers = (comic.creators || []).filter((c) => c.roles.includes('writer')).map((c) => c.name);
  const otherCreators = (comic.creators || []).filter((c) => !c.roles.includes('writer'));

  return (
    <div className="detail">
      <div className="detail-body">
        <div className="detail-poster">
          {comic.cover_url ? (
            <img
              src={comic.cover_url}
              alt={comic.title}
              className="cover clickable"
              title="Click to upload a different cover"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => fileInputRef.current?.click()}>{comic.title}</div>
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
            {comic.series || comic.title} {comic.issue_number ? <span className="year">#{comic.issue_number}</span> : null}
          </h1>
          {comic.series && comic.title !== comic.series && comic.title !== `${comic.series} #${comic.issue_number}` && (
            <p className="muted original-title">{comic.title}</p>
          )}
          {writers.length > 0 && <p className="director">Written by {writers.join(', ')}</p>}
          <p className="overview">{comic.description}</p>

          <div className="stats">
            {comic.year ? <span>{comic.year}</span> : null}
            {comic.publisher ? <span>{comic.publisher}</span> : null}
          </div>

          {otherCreators.length > 0 && (
            <p className="muted">
              <strong>Creators:</strong>{' '}
              {otherCreators.map((c) => `${c.name} (${c.roles.join(', ')})`).join(', ')}
            </p>
          )}

          {comic.file_path && (
            <div className="filepaths">
              <strong>Source file:</strong>
              <div className="filepath-line">{comic.file_path}</div>
            </div>
          )}

          <div className="tags">
            {comic.comicvine_issue_id && (
              <a
                className="tag link-tag"
                href={`https://comicvine.gamespot.com/issue/4000-${comic.comicvine_issue_id}/`}
                target="_blank"
                rel="noreferrer"
              >
                ComicVine ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !comic.comicvine_issue_id}>
              {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
            </button>
            <SearchAgain
              sources={COMICVINE_SOURCES}
              queryPlaceholder="Series name and issue #, e.g. Batman 5"
              idField="id"
              imageField="cover_url"
              renderLabel={(c) => `${c.series} #${c.issue_number}${c.year ? ` (${c.year})` : ''}`}
              rematch={(_source, issueId) => api.rematchComic(id, { issue_id: issueId })}
              onRematched={setComic}
            />
            <button className="danger" onClick={remove}>Remove from Collection</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
