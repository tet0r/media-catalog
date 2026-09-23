import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function VinylDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getVinylRecord(id).then(setRecord).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!record) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${record.title}" from your local library? It will come back on the next Discogs sync unless you also remove it from your Discogs collection.`)) return;
    await api.deleteVinylRecord(id);
    navigate('/music/vinyl');
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setRecord(await api.uploadVinylCover(id, file));
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
          {record.cover_url ? (
            <img
              src={record.cover_url}
              alt={record.title}
              className="cover clickable"
              title="Click to upload a different cover"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => fileInputRef.current?.click()}>{record.title}</div>
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
            {record.title} {record.year ? <span className="year">({record.year})</span> : null}
          </h1>
          {record.artist && <p className="director">by {record.artist}</p>}

          <div className="tags">
            {(record.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          <div className="stats">
            {record.format ? <span>{record.format}</span> : null}
          </div>

          {record.label && (
            <p className="muted">
              <strong>Label:</strong> {record.label}{record.catalog_number ? ` — ${record.catalog_number}` : ''}
            </p>
          )}
          {record.date_added && (
            <p className="muted"><strong>Added to Discogs collection:</strong> {new Date(record.date_added).toLocaleDateString()}</p>
          )}

          <div className="tags">
            {record.discogs_release_id && (
              <a
                className="tag link-tag"
                href={`https://www.discogs.com/release/${record.discogs_release_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Discogs ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button className="danger" onClick={remove}>Remove from Local Library</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
