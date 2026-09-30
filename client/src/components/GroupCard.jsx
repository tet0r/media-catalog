// A "group by author/series" card — used by AudiobookLibrary/EbookLibrary
// (grouped by author) and ComicLibrary (grouped by series). No dedicated
// image exists for an author or a series (there's no such entity in the
// database, just a text field shared by several items), so this borrows
// the same fallback CollectionCard.jsx already uses for a manual
// collection with no poster: a 2x2 collage of up to 4 member covers,
// blank-filling any missing slots.
//
// Clicking the card just calls `onClick` (opening GroupDetailModal in the
// caller) — this component doesn't own any expand/collapse state itself.
export default function GroupCard({ id, label, count, countLabel, coverUrls, onClick }) {
  const covers = (coverUrls || []).filter(Boolean).slice(0, 4);
  return (
    <div id={id} className="group-card-wrap">
      <button type="button" className="card group-card" onClick={onClick}>
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
        <div className="card-meta">{count} {countLabel}{count === 1 ? '' : 's'}</div>
      </button>
    </div>
  );
}
