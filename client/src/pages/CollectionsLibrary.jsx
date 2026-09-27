import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import CollectionCard from '../components/CollectionCard.jsx';

export default function CollectionsLibrary() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listCollections().then(setCollections).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function createCollection(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createCollection(newName.trim());
      navigate(`/movies/collections/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="library-page">
      <form onSubmit={createCollection} className="pending-search-row" style={{ marginBottom: 20 }}>
        <input
          placeholder="New collection name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={creating || !newName.trim()}>
          {creating ? 'Creating...' : '+ New Collection'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : collections.length === 0 ? (
        <p className="empty">
          No collections yet. Create one above, or add a movie that belongs to a TMDB franchise
          (like Star Wars or Toy Story) and one will show up here automatically.
        </p>
      ) : (
        <>
          <div className="grid">
            {collections.map((c) => (
              <Link key={c.id} to={`/movies/collections/${c.id}`}>
                <CollectionCard collection={c} />
              </Link>
            ))}
          </div>
          <p className="count">{collections.length} collection{collections.length === 1 ? '' : 's'}</p>
        </>
      )}
    </div>
  );
}
