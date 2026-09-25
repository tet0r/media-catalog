export default function TvShowCard({ show }) {
  return (
    <div className="card">
      <div className="poster">
        {show.poster_url ? (
          <img src={show.poster_url} alt={show.title} />
        ) : (
          <div className="no-poster">{show.title}</div>
        )}
        {show.personal_rating ? <span className="badge">{'★'.repeat(show.personal_rating)}</span> : null}
      </div>
      <div className="card-title">{show.title}</div>
      <div className="card-meta">{show.year || ''}</div>
    </div>
  );
}
