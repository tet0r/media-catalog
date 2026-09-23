export default function AlbumCard({ album }) {
  return (
    <div className="card">
      <div className="poster cover">
        {album.cover_url ? (
          <img src={album.cover_url} alt={album.title} />
        ) : (
          <div className="no-poster">{album.title}</div>
        )}
      </div>
      <div className="card-title">{album.title}</div>
      <div className="card-meta">{album.artist}</div>
    </div>
  );
}
