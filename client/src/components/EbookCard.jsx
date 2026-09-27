// `id`/`selectMode`/`selected`/`onToggleSelect` are optional passthroughs
// for the library page's bulk-select feature — the card's own root div
// carries the click handler and id (used for letter-jump navigation)
// directly rather than needing an extra wrapper div around it.
export default function EbookCard({ ebook, id, selectMode, selected, onToggleSelect }) {
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
        {ebook.cover_url ? (
          <img src={ebook.cover_url} alt={ebook.title} />
        ) : (
          <div className="no-poster">{ebook.title}</div>
        )}
      </div>
      <div className="card-title">{ebook.title}</div>
      <div className="card-meta">{(ebook.authors || []).join(', ')}</div>
    </div>
  );
}
