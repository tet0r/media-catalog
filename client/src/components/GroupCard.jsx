// A "group by author/series" card — used by AudiobookLibrary/EbookLibrary
// (grouped by author) and ComicLibrary (grouped by series). No dedicated
// image exists for an author or a series (there's no such entity in the
// database, just a text field shared by several items), so this borrows
// the same fallback CollectionCard.jsx already uses for a manual
// collection with no poster of its own: a 2x2 collage of up to 4 member
// covers, blank-filling any missing slots.
//
// Clicking the card toggles `expanded` (owned by the caller, since which
// groups are open is page-level state) rather than navigating anywhere —
// the group's own items render directly beneath it, spanning the full
// grid row, via the `.group-card-wrap.expanded` CSS rule.
export default function GroupCard({ id, label, count, countLabel, coverUrls, expanded, onToggle, children }) {
  const covers = (coverUrls || []).filter(Boolean).slice(0, 4);
  return (
    <div id={id} className={`group-card-wrap${expanded ? ' expanded' : ''}`}>
      <button type="button" className="card group-card" onClick={onToggle}>
        <div className="poster cover">
          {covers.length > 0 ? (
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
        <div className="card-meta">{expanded ? '▾' : '▸'} {count} {countLabel}{count === 1 ? '' : 's'}</div>
      </button>
      {expanded && <div className="group-card-expanded grid">{children}</div>}
    </div>
  );
}
