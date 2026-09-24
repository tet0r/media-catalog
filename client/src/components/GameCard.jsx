export default function GameCard({ game }) {
  return (
    <div className="card">
      <div className="poster cover">
        {game.cover_url ? (
          <img src={game.cover_url} alt={game.title} />
        ) : (
          <div className="no-poster">{game.title}</div>
        )}
      </div>
      <div className="card-title">{game.title}</div>
      <div className="card-meta">{game.platform}</div>
    </div>
  );
}
