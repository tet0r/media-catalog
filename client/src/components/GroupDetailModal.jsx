import { useRef, useState } from 'react';
import ImagePicker from './ImagePicker.jsx';

// The pop-over shown when a GroupCard (an author or a series) is clicked —
// same modal pattern as BulkAddToCollectionModal/ImagePicker: a dimmed
// backdrop over the rest of the page, click-outside or Close to dismiss.
// The group's name lives in the modal's own header, so it stays clearly
// visible no matter how many items are inside — unlike an in-place
// expand, where the trigger card's label can scroll out of view once
// there's more than a couple of items.
//
// `onRename` is optional — passing neither it nor `onUploadCover` renders
// a read-only header/picture, same as any caller that doesn't wire them
// up. `imageSearchTabs` (same shape ImagePicker itself takes) opens the
// full search-or-upload picker instead of a plain file upload when
// clicking the picture — every caller passes this now, but it's optional
// so a future caller with no relevant image source can still fall back
// to upload-only.
export default function GroupDetailModal({
  label, count, countLabel, coverUrls, customImageUrl, onClose, onRename, onUploadCover, onSetCoverUrl, onDeleteCover, imageSearchTabs, children,
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(label);
  const [renaming, setRenaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  async function handleRemoveCover() {
    setRemoving(true);
    setError(null);
    try {
      await onDeleteCover();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
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
              title="Click to set a picture for this group"
              onClick={() => (imageSearchTabs ? setPickerOpen(true) : fileInputRef.current?.click())}
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
            {imageSearchTabs ? (
              <button type="button" className="muted-btn" onClick={() => setPickerOpen(true)}>
                Set Picture...
              </button>
            ) : (
              <>
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
              </>
            )}
            {onDeleteCover && customImageUrl && (
              <button type="button" className="muted-btn" disabled={removing} onClick={handleRemoveCover}>
                {removing ? 'Removing...' : 'Remove Picture'}
              </button>
            )}
          </div>
        )}

        <p className="muted">{count} {countLabel}{count === 1 ? '' : 's'}</p>
        {error && <p className="error">{error}</p>}
        <div className="grid">{children}</div>
      </div>

      {pickerOpen && (
        <ImagePicker
          title={`Choose a Picture for "${label}"`}
          tabs={imageSearchTabs}
          onSelect={onSetCoverUrl}
          onUpload={onUploadCover}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
