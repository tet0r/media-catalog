import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import MovieCard from '../components/MovieCard.jsx';

export default function Library() {
  const [movies, setMovies] = useState([]);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState('title');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .listMovies({ q, format, sort })
      .then(setMovies)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, format, sort]);

  return (
    <div>
      <div className="toolbar">
        <input placeholder="Search your collection..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">All formats</option>
          <option value="DVD">DVD</option>
          <option value="Blu-ray">Blu-ray</option>
          <option value="4K UHD">4K UHD</option>
          <option value="Digital">Digital</option>
          <option value="File">File</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="added_at">Recently Added</option>
          <option value="personal_rating">My Rating</option>
          <option value="tmdb_rating">TMDB Rating</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : movies.length === 0 ? (
        <p className="empty">
          No movies yet. Use "Add Movie" to search by title, or "Scan Library" to import from your movie folder.
        </p>
      ) : (
        <div className="grid">
          {movies.map((m) => (
            <Link key={m.id} to={`/movies/${m.id}`}>
              <MovieCard movie={m} />
            </Link>
          ))}
        </div>
      )}
      <p className="count">{movies.length} movie{movies.length === 1 ? '' : 's'}</p>
    </div>
  );
}
