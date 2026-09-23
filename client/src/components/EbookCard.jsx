export default function EbookCard({ ebook }) {
  return (
    <div className="card">
      <div className="poster cover">
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
