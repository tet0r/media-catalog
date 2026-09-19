import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ImagePicker from '../components/ImagePicker.jsx';

function formatMoney(n) {
  if (!n) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function groupCrewByJob(crew) {
  const byJob = {};
  for (const c of crew || []) {
    byJob[c.job] = byJob[c.job] || [];
    byJob[c.job].push(c.name);
  }
  return byJob;
}

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null); // 'poster' | 'backdrop' | null
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.getMovie(id).then(setMovie).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!movie) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${movie.title}" from your collection?`)) return;
    await api.deleteMovie(id);
    navigate('/movies');
  }

  async function applyPoster(url) {
    setMovie(await api.setMoviePoster(id, url));
  }

  async function uploadPoster(file) {
    setMovie(await api.uploadMoviePoster(id, file));
  }

  async function applyBackdrop(url) {
    setMovie(await api.setMovieBackdrop(id, url));
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setMovie(await api.refreshMovie(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const crewByJob = groupCrewByJob(movie.crew);
  const budget = formatMoney(movie.budget);
  const revenue = formatMoney(movie.revenue);

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
          {movie.original_title && movie.original_title !== movie.title && (
            <p className="muted original-title">Original title: {movie.original_title}</p>
          )}
          {movie.tagline && <p className="tagline">&ldquo;{movie.tagline}&rdquo;</p>}
          {movie.director && <p className="director">Directed by {movie.director}</p>}
          <p className="overview">{movie.overview}</p>
          <div className="tags">
            {(movie.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          <div className="stats">
            {movie.content_rating ? <span>{movie.content_rating}</span> : null}
            {movie.runtime ? <span>{movie.runtime} min</span> : null}
            {movie.tmdb_rating ? (
              <span>
                TMDB {movie.tmdb_rating.toFixed(1)}/10{movie.vote_count ? ` (${movie.vote_count.toLocaleString()} votes)` : ''}
              </span>
            ) : null}
            {movie.status && movie.status !== 'Released' ? <span>{movie.status}</span> : null}
            {movie.original_language ? <span>Language: {movie.original_language.toUpperCase()}</span> : null}
          </div>

          {movie.cast && movie.cast.length > 0 && (
            <div className="cast-section">
              <strong>Cast</strong>
              <div className="cast-grid">
                {movie.cast.map((c) => (
                  <div key={c.name} className="cast-member">
                    {c.profile_url ? (
                      <img src={c.profile_url} alt={c.name} />
                    ) : (
                      <div className="cast-member-noimg">{c.name}</div>
                    )}
                    <div className="cast-name">{c.name}</div>
                    {c.character && <div className="cast-character muted">{c.character}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.entries(crewByJob).map(([job, names]) => (
            <p key={job} className="crew-line">
              <strong>{job}:</strong> {names.join(', ')}
            </p>
          ))}

          {movie.production_companies && movie.production_companies.length > 0 && (
            <p className="muted"><strong>Production:</strong> {movie.production_companies.join(', ')}</p>
          )}
          {movie.spoken_languages && movie.spoken_languages.length > 0 && (
            <p className="muted"><strong>Spoken languages:</strong> {movie.spoken_languages.join(', ')}</p>
          )}
          {(budget || revenue) && (
            <p className="muted">
              {budget ? <>Budget: {budget}</> : null}
              {budget && revenue ? ' · ' : ''}
              {revenue ? <>Revenue: {revenue}</> : null}
            </p>
          )}

          <div className="tags">
            {movie.imdb_id && (
              <a className="tag link-tag" href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noreferrer">
                IMDb ↗
              </a>
            )}
            <a className="tag link-tag" href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`} target="_blank" rel="noreferrer">
              TMDB ↗
            </a>
            {movie.homepage && (
              <a className="tag link-tag" href={movie.homepage} target="_blank" rel="noreferrer">
                Official Site ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !movie.tmdb_id}>
              {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
            </button>
            <button className="danger" onClick={remove}>Remove from Collection</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>

      {picker === 'poster' && (
        <ImagePicker
          title="Choose a Poster"
          tabs={[
            {
              key: 'tpdb',
              label: 'ThePosterDB',
              sourceLabel: 'Via ThePosterDB — unofficial, may occasionally be unavailable.',
              fetchOptions: () => api.searchTpdbPosters(movie.title, movie.year),
            },
            {
              key: 'tmdb',
              label: 'TMDB',
              sourceLabel: "Via TMDB's own poster gallery for this movie.",
              fetchOptions: () => api.searchTmdbPosters(movie.tmdb_id),
            },
          ]}
          onSelect={applyPoster}
          onUpload={uploadPoster}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'backdrop' && (
        <ImagePicker
          title="Choose a Banner"
          tabs={[
            {
              key: 'tmdb',
              label: 'TMDB',
              sourceLabel: "Via TMDB's image gallery for this movie.",
              fetchOptions: () => api.searchTmdbBackdrops(movie.tmdb_id),
            },
          ]}
          onSelect={applyBackdrop}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
