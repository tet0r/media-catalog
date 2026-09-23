import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function EbookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getEbook(id).then(setBook).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!book) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${book.title}" from your collection?`)) return;
    await api.deleteEbook(id);
    navigate('/ebooks');
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setBook(await api.refreshEbook(id));
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
      setBook(await api.uploadEbookCover(id, file));
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
          {book.authors && book.authors.length > 0 && (
            <p className="director">by {book.authors.join(', ')}</p>
          )}
          <p className="overview">{book.description}</p>
          <div className="tags">
            {(book.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          <div className="stats">
            {book.page_count ? <span>{book.page_count} pages</span> : null}
            {book.file_format ? <span>{book.file_format.toUpperCase()}</span> : null}
            {book.language ? <span>{book.language}</span> : null}
          </div>

          {book.publisher && (
            <p className="muted"><strong>Publisher:</strong> {book.publisher}</p>
          )}
          {book.isbn && (
            <p className="muted"><strong>ISBN:</strong> {book.isbn}</p>
          )}

          {book.file_path && (
            <div className="filepaths">
              <strong>Source file:</strong>
              <div className="filepath-line">{book.file_path}</div>
            </div>
          )}

          <div className="tags">
            {book.external_id && (
              <a className="tag link-tag" href={`https://openlibrary.org/works/${book.external_id}`} target="_blank" rel="noreferrer">
                Open Library ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !book.external_id}>
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
