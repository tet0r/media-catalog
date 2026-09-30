// The pop-over shown when a GroupCard (an author or a series) is clicked —
// same modal pattern as BulkAddToCollectionModal/ImagePicker: a dimmed
// backdrop over the rest of the page, click-outside or Close to dismiss.
// The group's name lives in the modal's own header, so it stays clearly
// visible no matter how many items are inside — unlike an in-place
// expand, where the trigger card's label can scroll out of view once
// there's more than a couple of items.
export default function GroupDetailModal({ label, count, countLabel, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{label}</h2>
          <button className="muted-btn" onClick={onClose}>Close</button>
        </div>
        <p className="muted">{count} {countLabel}{count === 1 ? '' : 's'}</p>
        <div className="grid">{children}</div>
      </div>
    </div>
  );
}
