import { useEffect, useRef, useState } from 'react';

// Generic action-list dropdown, same click-outside-to-close idiom as
// SortMenu — used for the "N selected" bulk actions menu on every library
// page. `actions`: [{ key, label, onClick, danger? }].
export default function BulkActionsMenu({ count, actions, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function run(action) {
    setOpen(false);
    action.onClick();
  }

  return (
    <div className="sort-menu" ref={ref}>
      <button type="button" className="sort-menu-trigger" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {count} selected ▾
      </button>
      {open && (
        <div className="sort-menu-list" role="menu">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={a.danger ? 'danger-text' : ''}
              onClick={() => run(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
