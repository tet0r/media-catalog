import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ImagePicker from '../components/ImagePicker.jsx';
import SearchAgain from '../components/SearchAgain.jsx';

const TVDB_SOURCES = [
  { key: 'tvdb', label: 'TheTVDB', search: (q) => api.searchTvdb(q), lookupUrl: api.lookupTvdbUrl, urlPlaceholder: 'Paste a thetvdb.com or imdb.com series URL' },
];

export default function TvShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null); // 'poster' | null
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.getTvShow(id).then(setShow).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!show) return <p>Loading...</p>;

  async function remove() {
    if (!confirm(`Remove "${show.title}" from your collection?`)) return;
    await api.deleteTvShow(id);
    navigate('/tv');
  }

  async function applyPoster(url) {
    setShow(await api.setTvShowPoster(id, url));
  }

  async function uploadPoster(file) {
    setShow(await api.uploadTvShowPoster(id, file));
  }

  async function refreshMetadata() {
    setRefreshing(true);
    setError(null);
    try {
      setShow(await api.refreshTvShow(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="detail">
      {show.backdrop_url && (
        <div className="backdrop" style={{ backgroundImage: `url(${show.backdrop_url})` }} />
      )}
      <div className="detail-body">
        <div className="detail-poster">
          {show.poster_url ? (
            <img
              src={show.poster_url}
              alt={show.title}
              className="clickable"
              title="Click to choose a different poster"
              onClick={() => setPicker('poster')}
            />
          ) : (
            <div className="no-poster large clickable" onClick={() => setPicker('poster')}>{show.title}</div>
          )}
        </div>
        <div className="detail-info">
          <h1>
            {show.title} {show.year ? <span className="year">({show.year})</span> : null}
          </h1>
          {show.network && <p className="director">{show.network}</p>}
          <p className="overview">{show.overview}</p>
          <div className="tags">
            {(show.genres || []).map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>

          <div className="stats">
            {show.content_rating ? <span>{show.content_rating}</span> : null}
            {show.runtime ? <span>{show.runtime} min/episode</span> : null}
            {show.status ? <span>{show.status}</span> : null}
            {show.original_language ? <span>Language: {show.original_language.toUpperCase()}</span> : null}
          </div>

          {show.cast && show.cast.length > 0 && (
            <div className="cast-section">
              <strong>Cast</strong>
              <div className="cast-grid">
                {show.cast.map((c) => (
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

          {show.production_companies && show.production_companies.length > 0 && (
            <p className="muted"><strong>Production:</strong> {show.production_companies.join(', ')}</p>
          )}
          {show.first_aired && (
            <p className="muted"><strong>First aired:</strong> {new Date(show.first_aired).toLocaleDateString()}</p>
          )}

          <div className="tags">
            {show.imdb_id && (
              <a className="tag link-tag" href={`https://www.imdb.com/title/${show.imdb_id}/`} target="_blank" rel="noreferrer">
                IMDb ↗
              </a>
            )}
            {show.slug && (
              <a className="tag link-tag" href={`https://www.thetvdb.com/series/${show.slug}`} target="_blank" rel="noreferrer">
                TheTVDB ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button onClick={refreshMetadata} disabled={refreshing || !show.tvdb_id}>
              {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
            </button>
            <SearchAgain
              sources={TVDB_SOURCES}
              queryPlaceholder="Show title"
              idField="tvdb_id"
              imageField="poster_url"
              renderLabel={(c) => `${c.title} (${c.year})`}
              rematch={(_source, tvdbId) => api.rematchTvShow(id, { tvdb_id: tvdbId })}
              onRematched={setShow}
            />
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
              key: 'tvdb',
              label: 'TheTVDB',
              sourceLabel: "Via TheTVDB's own artwork for this show.",
              fetchOptions: () => api.searchTvdbPosters(show.tvdb_id),
            },
          ]}
          onSelect={applyPoster}
          onUpload={uploadPoster}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
