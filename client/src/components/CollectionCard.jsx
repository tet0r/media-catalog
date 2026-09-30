// Franchise collections have a real TMDB poster (poster_url). Manual
// collections don't, so they fall back to a collage of up to 4 member
// posters instead of needing their own image entirely.
//
// `selectMode`/`selected`/`onToggleSelect` are optional passthroughs for
// the library page's bulk-select feature — see MovieCard.jsx for the full
// rationale.
export default function CollectionCard({ collection, selectMode, selected, onToggleSelect }) {
  const collage = !collection.poster_url && collection.movies.length > 0;
  return (
    <div
      className={`card${selectMode ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      <div className="poster collection-poster">
        {selectMode && (
          <input
            type="checkbox"
            className="card-select"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {collection.poster_url ? (
          <img src={collection.poster_url} alt={collection.name} />
        ) : collage ? (
          <div className="collection-collage">
            {collection.movies.slice(0, 4).map((m) =>
              m.poster_url ? (
                <img key={m.id} src={m.poster_url} alt="" />
              ) : (
                <div key={m.id} className="collection-collage-blank" />
              )
            )}
          </div>
        ) : (
          <div className="no-poster">{collection.name}</div>
        )}
      </div>
      <div className="card-title">{collection.name}</div>
      <div className="card-meta">{collection.movie_count} movie{collection.movie_count === 1 ? '' : 's'}</div>
    </div>
  );
}
