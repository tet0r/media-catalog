import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ImagePicker from '../components/ImagePicker.jsx';

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Both throw on failure so the picker can show the error and stay open.
  const applyCover = async (url) => setGame(await api.setGameCover(id, url));
  const uploadCover = async (file) => setGame(await api.uploadGameCover(id, file));

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
              title="Click to choose a different cover"
              onClick={() => setPickerOpen(true)}
            />
          ) : (
            <div className="no-poster large cover clickable" onClick={() => setPickerOpen(true)}>{game.title}</div>
          )}
          <button type="button" className="muted-btn cover-upload-btn" onClick={() => setPickerOpen(true)}>
            Change Cover...
          </button>
        </div>
        <div className="detail-info">
          <h1>
            {game.title} {year ? <span className="year">({year})</span> : null}
          </h1>
          {game.platform && <p className="director">{game.platform}</p>}
          {game.source && <p className="muted"><strong>Store:</strong> {game.source}</p>}
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

      {pickerOpen && (
        <ImagePicker
          title="Choose a Cover"
          tabs={[
            {
              key: 'steam',
              label: 'Steam',
              sourceLabel: "Via Steam's store art — only finds games sold on Steam.",
              fetchOptions: () => api.searchGameCovers(id, 'steam'),
            },
            {
              key: 'steamgriddb',
              label: 'SteamGridDB',
              sourceLabel: 'Via SteamGridDB — community cover art for games on any platform or store. Needs a free API key (Settings > Games).',
              fetchOptions: () => api.searchGameCovers(id, 'steamgriddb'),
            },
          ]}
          onSelect={applyCover}
          onUpload={uploadCover}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
