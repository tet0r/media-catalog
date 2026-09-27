// `id`/`selectMode`/`selected`/`onToggleSelect` are optional passthroughs
// for the library page's bulk-select feature — see MovieCard.jsx for the
// full rationale.
export default function ComicCard({ comic, id, selectMode, selected, onToggleSelect }) {
  return (
    <div
      id={id}
      className={`card${selectMode ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      <div className="poster cover">
        {selectMode && (
          <input
            type="checkbox"
            className="card-select"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {comic.cover_url ? (
          <img src={comic.cover_url} alt={comic.title} />
        ) : (
          <div className="no-poster">{comic.title}</div>
        )}
      </div>
      <div className="card-title">{comic.series || comic.title}</div>
      <div className="card-meta">{comic.issue_number ? `#${comic.issue_number}` : ''}{comic.year ? ` (${comic.year})` : ''}</div>
    </div>
  );
}
