import { useRef, useState } from 'react';

// The pop-over shown when a GroupCard (an author or a series) is clicked —
// same modal pattern as BulkAddToCollectionModal/ImagePicker: a dimmed
// backdrop over the rest of the page, click-outside or Close to dismiss.
// The group's name lives in the modal's own header, so it stays clearly
// visible no matter how many items are inside — unlike an in-place
// expand, where the trigger card's label can scroll out of view once
// there's more than a couple of items.
//
// `onRename`/`onUploadCover` are optional — passing neither renders a
// read-only header, same as any caller that doesn't wire them up.
export default function GroupDetailModal({
  label, count, countLabel, coverUrls, customImageUrl, onClose, onRename, onUploadCover, children,
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(label);
  const [renaming, setRenaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const covers = (coverUrls || []).filter(Boolean).slice(0, 4);

  async function saveRename(e) {
    e.preventDefault();
    if (!nameDraft.trim() || nameDraft.trim() === label) {
      setEditing(false);
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      await onRename(nameDraft.trim());
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploadCover(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {editing ? (
            <form onSubmit={saveRename} className="pending-search-row" style={{ flex: 1 }}>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
              <button type="submit" disabled={renaming || !nameDraft.trim()}>{renaming ? 'Saving...' : 'Save'}</button>
              <button type="button" className="muted-btn" onClick={() => { setEditing(false); setNameDraft(label); }}>Cancel</button>
            </form>
          ) : (
            <h2>
              {label}
              {onRename && (
                <button type="button" className="muted-btn" style={{ marginLeft: 10 }} onClick={() => setEditing(true)}>
                  Rename
                </button>
              )}
            </h2>
          )}
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>

        {onUploadCover && (
          <div className="group-modal-picture">
            <div
              className="poster cover clickable"
              title="Click to upload a picture for this group"
              onClick={() => fileInputRef.current?.click()}
            >
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleCoverFile}
            />
            <button type="button" className="muted-btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? 'Uploading...' : 'Set Picture...'}
            </button>
          </div>
        )}

        <p className="muted">{count} {countLabel}{count === 1 ? '' : 's'}</p>
        {error && <p className="error">{error}</p>}
        <div className="grid">{children}</div>
      </div>
    </div>
  );
}
