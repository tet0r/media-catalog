import { useEffect, useRef, useState } from 'react';

// How many pictures one page of a source shows. A source with more than this
// (ThePosterDB can have over a hundred posters for a movie) is split into
// numbered page tabs instead of one long scrolling list.
const PAGE_SIZE = 24;

// `tabs`: [{ key, label, sourceLabel, fetchOptions }]. Each source's
// options are fetched lazily (only once its tab is first opened) and
// cached per-key so switching back and forth doesn't re-fetch.
export default function ImagePicker({ title, tabs, onSelect, onUpload, onClose }) {
  const [activeKey, setActiveKey] = useState(tabs[0].key);
  const [page, setPage] = useState(0);
  const [cache, setCache] = useState({});
  const [selecting, setSelecting] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const active = tabs.find((t) => t.key === activeKey);
  const state = cache[activeKey];

  useEffect(() => {
    if (cache[activeKey]) return;
    let cancelled = false;
    setCache((c) => ({ ...c, [activeKey]: { loading: true, options: [], warning: null, error: null } }));
    active
      .fetchOptions()
      .then((r) => {
        if (cancelled) return;
        // Some sources (TMDB) just return a plain array; ThePosterDB returns
        // { results, warning } so a "the scraper itself looks broken" state
        // can be told apart from "this movie genuinely has no posters".
        const options = Array.isArray(r) ? r : r.results || [];
        const warning = Array.isArray(r) ? null : r.warning || null;
        setCache((c) => ({ ...c, [activeKey]: { loading: false, options, warning, error: null } }));
      })
      .catch((err) => {
        if (cancelled) return;
        setCache((c) => ({ ...c, [activeKey]: { loading: false, options: [], warning: null, error: err.message } }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

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

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(file);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const allOptions = state?.options || [];
  const pageCount = Math.max(1, Math.ceil(allOptions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const options = allOptions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const loading = state?.loading;
  const warning = state?.warning;
  const fetchError = state?.error;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>

        <div className="picker-toolbar">
          {tabs.length > 1 && (
            <div className="picker-tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`picker-tab${t.key === activeKey ? ' active' : ''}`}
                  onClick={() => { setActiveKey(t.key); setPage(0); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {onUpload && (
            <>
              <button
                type="button"
                className="muted-btn"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading...' : 'Upload Image...'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </>
          )}
        </div>

        {active.sourceLabel && <p className="muted">{active.sourceLabel}</p>}
        {loading && <p>Loading options...</p>}
        {fetchError && <p className="error">{fetchError}</p>}
        {warning && <p className="warning">⚠ {warning}</p>}
        {!loading && !fetchError && !warning && allOptions.length === 0 && <p className="muted">No alternatives found.</p>}
        {pageCount > 1 && (
          <div className="picker-pages">
            <div className="picker-tabs picker-page-tabs" role="tablist" aria-label="Pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === currentPage}
                  className={`picker-tab${i === currentPage ? ' active' : ''}`}
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <span className="muted picker-page-count">
              {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, allOptions.length)} of {allOptions.length}
            </span>
          </div>
        )}
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
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
