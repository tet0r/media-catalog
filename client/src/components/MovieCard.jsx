export default function MovieCard({ movie }) {
  return (
    <div className="card">
      <div className="poster">
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} />
        ) : (
          <div className="no-poster">{movie.title}</div>
        )}
        {movie.personal_rating ? <span className="badge">{'★'.repeat(movie.personal_rating)}</span> : null}
      </div>
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">{movie.year || ''} · {movie.format}</div>
    </div>
  );
}
