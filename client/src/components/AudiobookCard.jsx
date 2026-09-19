export default function AudiobookCard({ audiobook }) {
  return (
    <div className="card">
      <div className="poster cover">
        {audiobook.cover_url ? (
          <img src={audiobook.cover_url} alt={audiobook.title} />
        ) : (
          <div className="no-poster">{audiobook.title}</div>
        )}
        {audiobook.rating ? <span className="badge">★ {audiobook.rating.toFixed(1)}</span> : null}
      </div>
      <div className="card-title">{audiobook.title}</div>
      <div className="card-meta">{(audiobook.authors || []).join(', ')}</div>
    </div>
  );
}
