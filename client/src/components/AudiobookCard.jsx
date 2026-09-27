// `id`/`selectMode`/`selected`/`onToggleSelect` are optional passthroughs
// for the library page's bulk-select feature — the card's own root div
// carries the click handler and id (used for letter-jump navigation)
// directly rather than needing an extra wrapper div around it.
export default function AudiobookCard({ audiobook, id, selectMode, selected, onToggleSelect }) {
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
