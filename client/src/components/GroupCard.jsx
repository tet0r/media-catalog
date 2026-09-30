// A "group by author/series" card — used by AudiobookLibrary/EbookLibrary
// (grouped by author) and ComicLibrary (grouped by series). If a custom
// picture was set for this group (see GroupDetailModal's cover upload),
// `customImageUrl` renders it as a normal full poster; otherwise this
// borrows the same fallback CollectionCard.jsx uses for a manual
// collection with no poster of its own: a 2x2 collage of up to 4 member
// covers, blank-filling any missing slots.
//
// `selectMode`/`selected`/`onToggleSelect` mirror the same passthrough
// every item card (ComicCard, AudiobookCard, ...) already supports, for
// selecting groups to merge — see the library pages' "Select Groups"
// toggle. Outside select mode, clicking the card calls `onClick` (opening
// GroupDetailModal in the caller).
export default function GroupCard({ id, label, count, countLabel, coverUrls, customImageUrl, onClick, selectMode, selected, onToggleSelect }) {
  const covers = (coverUrls || []).filter(Boolean).slice(0, 4);
  return (
    <div id={id} className="group-card-wrap">
      <button
        type="button"
        className={`card group-card${selectMode ? ' selectable' : ''}${selected ? ' selected' : ''}`}
        onClick={selectMode ? onToggleSelect : onClick}
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
          {customImageUrl ? (
            <img src={customImageUrl} alt="" />
          ) : covers.length > 0 ? (
            <div className="collection-collage">
              {Array.from({ length: 4 }, (_, i) => (
                covers[i] ? <img key={i} src={covers[i]} alt="" /> : <div key={i} className="collection-collage-blank" />
              ))}
            </div>
          ) : (
            <div className="no-poster">{label}</div>
          )}
        </div>
        <div className="card-title">{label}</div>
        <div className="card-meta">{count} {countLabel}{count === 1 ? '' : 's'}</div>
      </button>
    </div>
  );
}
