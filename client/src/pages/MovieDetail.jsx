import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ImagePicker from '../components/ImagePicker.jsx';

const FORMATS = ['DVD', 'Blu-ray', '4K UHD', 'Digital', 'File'];

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null); // 'poster' | 'backdrop' | null

  useEffect(() => {
    api
      .getMovie(id)
      .then((m) => {
        setMovie(m);
        setForm(m);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!movie || !form) return <p>Loading...</p>;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateMovie(id, {
        format: form.format,
        location: form.location,
        purchase_date: form.purchase_date,
        purchase_price: form.purchase_price === '' || form.purchase_price === null ? null : Number(form.purchase_price),
        purchase_store: form.purchase_store,
        personal_rating: form.personal_rating === '' || form.personal_rating === null ? null : Number(form.personal_rating),
        notes: form.notes,
        loaned_to: form.loaned_to,
        watched: !!form.watched,
        tags: form.tags,
      });
      setMovie(updated);
      setForm(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${movie.title}" from your collection?`)) return;
    await api.deleteMovie(id);
    navigate('/');
  }

  async function applyPoster(url) {
    const updated = await api.setMoviePoster(id, url);
    setMovie(updated);
    setForm(updated);
  }

  async function applyBackdrop(url) {
    const updated = await api.setMovieBackdrop(id, url);
    setMovie(updated);
    setForm(updated);
  }

  return (
    <div className="detail">
      {movie.backdrop_url && (
        <div
          className="backdrop clickable"
          title="Click to choose a different banner"
          style={{ backgroundImage: `url(${movie.backdrop_url})` }}
          onClick={() => setPicker('backdrop')}
        />
      )}
      <div className="detail-body">
        <div className="detail-poster">
          {movie.poster_url ? (
            <img
              src={movie.poster_url}
              alt={movie.title}
              className="clickable"
              title="Click to choose a different poster"
              onClick={() => setPicker('poster')}
            />
          ) : (
            <div className="no-poster large clickable" onClick={() => setPicker('poster')}>{movie.title}</div>
          )}
        </div>
        <div className="detail-info">
          <h1>
            {movie.title} {movie.year ? <span className="year">({movie.year})</span> : null}
          </h1>
          {movie.director && <p className="director">Directed by {movie.director}</p>}
          <p className="overview">{movie.overview}</p>
          <div className="tags">
            {(movie.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>
          <div className="stats">
            {movie.runtime ? <span>{movie.runtime} min</span> : null}
            {movie.tmdb_rating ? <span>TMDB {movie.tmdb_rating.toFixed(1)}/10</span> : null}
          </div>
          {movie.cast && movie.cast.length > 0 && (
            <p className="cast"><strong>Cast:</strong> {movie.cast.map((c) => c.name).join(', ')}</p>
          )}
          {movie.file_path && <p className="filepath"><strong>File:</strong> {movie.file_path}</p>}

          <hr />
          <h2>My Collection Info</h2>
          <div className="form-grid">
            <label>
              Format
              <select value={form.format || ''} onChange={(e) => set('format', e.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              Location
              <input
                value={form.location || ''}
                onChange={(e) => set('location', e.target.value)}
                placeholder="e.g. Living room shelf"
              />
            </label>
            <label>
              My Rating (1-5)
              <input type="number" min="0" max="5" value={form.personal_rating ?? ''} onChange={(e) => set('personal_rating', e.target.value)} />
            </label>
            <label>
              Watched
              <input type="checkbox" checked={!!form.watched} onChange={(e) => set('watched', e.target.checked)} />
            </label>
            <label>
              Purchase Date
              <input type="date" value={form.purchase_date || ''} onChange={(e) => set('purchase_date', e.target.value)} />
            </label>
            <label>
              Purchase Price
              <input type="number" step="0.01" value={form.purchase_price ?? ''} onChange={(e) => set('purchase_price', e.target.value)} />
            </label>
            <label>
              Purchase Store
              <input value={form.purchase_store || ''} onChange={(e) => set('purchase_store', e.target.value)} />
            </label>
            <label>
              Loaned To
              <input
                value={form.loaned_to || ''}
                onChange={(e) => set('loaned_to', e.target.value)}
                placeholder="Leave blank if not loaned out"
              />
            </label>
          </div>
          <label className="notes-label">
            Notes
            <textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button className="danger" onClick={remove}>Remove from Collection</button>
          </div>
        </div>
      </div>

      {picker === 'poster' && (
        <ImagePicker
          title="Choose a Poster"
          sourceLabel="Via ThePosterDB — unofficial, may occasionally be unavailable."
          fetchOptions={() => api.searchTpdbPosters(movie.title, movie.year)}
          onSelect={applyPoster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'backdrop' && (
        <ImagePicker
          title="Choose a Banner"
          sourceLabel="Via TMDB's image gallery for this movie."
          fetchOptions={() => api.searchTmdbBackdrops(movie.tmdb_id)}
          onSelect={applyBackdrop}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
