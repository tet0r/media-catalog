import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getGame(id).then(setGame).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!game) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${game.title}" from your local library? It will come back on the next LaunchBox sync unless you also remove it from LaunchBox.`)) return;
    await api.deleteGame(id);
    navigate('/games');
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setGame(await api.uploadGameCover(id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const year = game.release_date ? new Date(game.release_date).getFullYear() : null;

  return (
    <div className="detail">
      <div className="detail-body">
        <div className="detail-poster">
          {game.cover_url ? (
            <img
              src={game.cover_url}
              alt={game.title}
              className="cover clickable"
              title="Click to upload a different cover"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => fileInputRef.current?.click()}>{game.title}</div>
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
            {game.title} {year ? <span className="year">({year})</span> : null}
          </h1>
          {game.platform && <p className="director">{game.platform}</p>}
          {game.developer && <p className="muted"><strong>Developer:</strong> {game.developer}</p>}
          {game.publisher && <p className="muted"><strong>Publisher:</strong> {game.publisher}</p>}
          {game.rating && <p className="muted"><strong>Rating:</strong> {game.rating}</p>}

          <div className="tags">
            {(game.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          {game.overview && <p className="overview">{game.overview}</p>}

          <div className="actions">
            <button className="danger" onClick={remove}>Remove from Local Library</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
