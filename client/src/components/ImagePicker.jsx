import { useEffect, useState } from 'react';

export default function ImagePicker({ title, sourceLabel, fetchOptions, onSelect, onClose }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOptions()
      .then((r) => {
        if (cancelled) return;
        // Some sources (TMDB) just return a plain array; ThePosterDB returns
        // { results, warning } so a "the scraper itself looks broken" state
        // can be told apart from "this movie genuinely has no posters".
        if (Array.isArray(r)) {
          setOptions(r);
          setWarning(null);
        } else {
          setOptions(r.results || []);
          setWarning(r.warning || null);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(url) {
    setSelecting(url);
    setError(null);
    try {
      await onSelect(url);
      onClose();
    } catch (err) {
      setError(err.message);
      setSelecting(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>
        {sourceLabel && <p className="muted">{sourceLabel}</p>}
        {loading && <p>Loading options...</p>}
        {error && <p className="error">{error}</p>}
        {warning && <p className="warning">⚠ {warning}</p>}
        {!loading && !error && !warning && options.length === 0 && <p className="muted">No alternatives found.</p>}
        <div className="image-picker-grid">
          {options.map((o) => (
            <button
              key={o.url}
              type="button"
              className="image-picker-option"
              disabled={selecting === o.url}
              onClick={() => choose(o.url)}
            >
              <img src={o.thumbnail_url || o.url} alt="" loading="lazy" />
              {selecting === o.url && <span className="image-picker-saving">Saving...</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
