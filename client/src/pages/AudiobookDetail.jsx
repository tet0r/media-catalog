import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

function formatRuntime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function AudiobookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getAudiobook(id).then(setBook).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!book) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${book.title}" from your collection?`)) return;
    await api.deleteAudiobook(id);
    navigate('/audiobooks');
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setBook(await api.refreshAudiobook(id));
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
      setBook(await api.uploadAudiobookCover(id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const runtime = formatRuntime(book.runtime_minutes);

  return (
    <div className="detail">
      <div className="detail-body">
        <div className="detail-poster">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="cover clickable"
              title="Click to upload a different cover"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => fileInputRef.current?.click()}>{book.title}</div>
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
            {book.title} {book.year ? <span className="year">({book.year})</span> : null}
          </h1>
          {book.subtitle && <p className="muted original-title">{book.subtitle}</p>}
          {book.series && (
            <p className="director">
              {book.series}{book.series_sequence ? `, Book ${book.series_sequence}` : ''}
            </p>
          )}
          {book.authors && book.authors.length > 0 && (
            <p className="director">by {book.authors.join(', ')}</p>
          )}
          {book.narrators && book.narrators.length > 0 && (
            <p className="muted">Narrated by {book.narrators.join(', ')}</p>
          )}
          <p className="overview">{book.description}</p>
          <div className="tags">
            {(book.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          <div className="stats">
            {runtime ? <span>{runtime}</span> : null}
            {book.rating ? <span>★ {book.rating.toFixed(1)}/5</span> : null}
            {book.abridged ? <span>Abridged</span> : null}
            {book.language ? <span>{book.language[0].toUpperCase() + book.language.slice(1)}</span> : null}
          </div>

          {book.publisher && (
            <p className="muted"><strong>Publisher:</strong> {book.publisher}</p>
          )}

          <div className="tags">
            {book.asin && (
              <a className="tag link-tag" href={`https://www.audible.com/pd/${book.asin}`} target="_blank" rel="noreferrer">
                Audible ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !book.asin}>
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
