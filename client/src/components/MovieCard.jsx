// `id`/`selectMode`/`selected`/`onToggleSelect` are optional passthroughs
// for the library page's bulk-select feature — the card's own root div
// carries the click handler and id (used for letter-jump navigation)
// directly rather than needing an extra wrapper div around it.
export default function MovieCard({ movie, id, selectMode, selected, onToggleSelect }) {
  return (
    <div
      id={id}
      className={`card${selectMode ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      <div className="poster">
        {selectMode && (
          <input
            type="checkbox"
            className="card-select"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {movie.poster_url ? (
          <img src={movie.poster_url} alt={movie.title} />
        ) : (
          <div className="no-poster">{movie.title}</div>
        )}
        {movie.personal_rating ? <span className="badge">{'★'.repeat(movie.personal_rating)}</span> : null}
      </div>
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">{movie.year || ''}</div>
    </div>
  );
}
