import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MovieCard from './MovieCard.jsx';
import SortMenu from './SortMenu.jsx';

const TYPE_BLURB = {
  franchise: 'Franchise collection — membership follows TMDB automatically, and you can also add other movies to it by hand below.',
  manual: 'Manual collection — add or remove movies below.',
};

const SORT_OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'year', label: 'Year' },
];

// The pop-over shown when a collection card is clicked from
// CollectionsLibrary.jsx — same modal pattern (dimmed backdrop, click-
// outside or Close to dismiss) as GroupDetailModal for author/series/
// artist/platform groups, adapted for a collection's own richer feature
// set (add/remove/sort movies, rename, delete) rather than just a plain
// item grid. The standalone /movies/collections/:id route (CollectionDetail.jsx)
// is a separate, unrelated page kept for direct/bookmarked navigation —
// this modal is what the library grid itself opens now instead of routing
// there.
export default function CollectionDetailModal({ id, onClose }) {
  const [collection, setCollection] = useState(null);
  const [error, setError] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [sort, setSort] = useState('title');
  const [dir, setDir] = useState('asc');
  const [uploading, setUploading] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.getCollection(id).then(setCollection).catch((err) => setError(err.message));
  }, [id]);

  async function saveName(e) {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      setCollection(await api.renameCollection(id, nameDraft.trim()));
      setRenaming(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeCollection() {
    if (!confirm(`Delete the collection "${collection.name}"? The movies themselves aren't affected.`)) return;
    await api.deleteCollection(id);
    setDeleted(true);
    onClose();
  }

  async function search(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const r = await api.listMovies({ q: query });
      const memberIds = new Set(collection.movies.map((m) => m.id));
      setResults(r.filter((m) => !memberIds.has(m.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function addMovie(movieId) {
    setAddingId(movieId);
    setError(null);
    try {
      const updated = await api.addMovieToCollection(id, movieId);
      setCollection(updated);
      setResults((prev) => prev.filter((m) => m.id !== movieId));
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  async function removeMovie(movieId) {
    setRemovingId(movieId);
    setError(null);
    try {
      setCollection(await api.removeMovieFromCollection(id, movieId));
    } catch (err) {
      setError(err.message);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setCollection(await api.uploadCollectionCover(id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const sortedMovies = collection
    ? [...collection.movies].sort((a, b) => {
        let cmp;
        if (sort === 'year') {
          cmp = (a.year || 0) - (b.year || 0);
        } else {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        }
        return dir === 'desc' ? -cmp : cmp;
      })
    : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {deleted || !collection ? (
          <>
            <div className="modal-header">
              <h2>{error ? 'Error' : 'Loading...'}</h2>
              <button className="muted-btn" onClick={onClose}>Close</button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        ) : (
          <>
            <div className="modal-header">
              <div className="group-modal-picture">
                <div
                  className="poster collection-poster clickable"
                  title="Click to upload a picture for this collection"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {collection.poster_url ? (
                    <img src={collection.poster_url} alt="" />
                  ) : collection.movies.length > 0 ? (
                    <div className="collection-collage">
                      {collection.movies.slice(0, 4).map((m) =>
                        m.poster_url ? <img key={m.id} src={m.poster_url} alt="" /> : <div key={m.id} className="collection-collage-blank" />
                      )}
                    </div>
                  ) : (
                    <div className="no-poster">{collection.name}</div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCoverFile}
                />
                <button type="button" className="muted-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? 'Uploading...' : 'Set Picture...'}
                </button>
              </div>
              {renaming ? (
                <form onSubmit={saveName} className="pending-search-row" style={{ flex: 1 }}>
                  <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
                  <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  <button type="button" className="muted-btn" onClick={() => setRenaming(false)}>Cancel</button>
                </form>
              ) : (
                <h2>
                  {collection.name}{' '}
                  <button type="button" className="muted-btn" onClick={() => { setNameDraft(collection.name); setRenaming(true); }}>
                    Rename
                  </button>
                </h2>
              )}
              <button className="muted-btn" onClick={onClose}>Close</button>
            </div>
            <p className="muted">{TYPE_BLURB[collection.type]}</p>

            {error && <p className="error">{error}</p>}

            {collection.movies.length === 0 ? (
              <p className="empty">No movies in this collection yet.</p>
            ) : (
              <>
                <div className="toolbar" style={{ marginBottom: 14 }}>
                  <SortMenu sort={sort} dir={dir} onChange={(s, d) => { setSort(s); setDir(d); }} options={SORT_OPTIONS} />
                </div>
                <div className="grid">
                  {sortedMovies.map((m) => (
                    <div key={m.id} className="collection-movie-tile">
                      <Link to={`/movies/${m.id}`} onClick={onClose}>
                        <MovieCard movie={m} />
                      </Link>
                      {m.removable && (
                        <button
                          type="button"
                          className="collection-remove-btn"
                          title="Remove from collection"
                          disabled={removingId === m.id}
                          onClick={() => removeMovie(m.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="count">{collection.movies.length} movie{collection.movies.length === 1 ? '' : 's'}</p>

            <div className="pending-item" style={{ marginTop: 20 }}>
              <strong>Add Movies</strong>
              <form onSubmit={search} className="pending-search-row" style={{ marginTop: 10 }}>
                <input placeholder="Search your movie library..." value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
              </form>
              {results.length > 0 && (
                <div className="candidates">
                  {results.map((m) => (
                    <div key={m.id} className="candidate">
                      {m.poster_url ? <img src={m.poster_url} alt="" /> : null}
                      <span>{m.title} {m.year ? `(${m.year})` : ''}</span>
                      <button disabled={addingId === m.id} onClick={() => addMovie(m.id)}>
                        {addingId === m.id ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="danger" style={{ marginTop: 20 }} onClick={removeCollection}>
              Delete Collection
            </button>
          </>
        )}
      </div>
    </div>
  );
}
