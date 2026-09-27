// `id`/`selectMode`/`selected`/`onToggleSelect` are optional passthroughs
// for the library page's bulk-select feature — the card's own root div
// carries the click handler and id (used for letter-jump navigation)
// directly rather than needing an extra wrapper div around it.
export default function TvShowCard({ show, id, selectMode, selected, onToggleSelect }) {
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
