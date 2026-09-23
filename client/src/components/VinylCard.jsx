export default function VinylCard({ record }) {
  return (
    <div className="card">
      <div className="poster cover">
        {record.cover_url ? (
          <img src={record.cover_url} alt={record.title} />
        ) : (
          <div className="no-poster">{record.title}</div>
        )}
      </div>
      <div className="card-title">{record.title}</div>
      <div className="card-meta">{record.artist}</div>
    </div>
  );
}
