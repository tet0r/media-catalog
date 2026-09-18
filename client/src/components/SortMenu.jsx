import { useEffect, useRef, useState } from 'react';

const OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'year', label: 'Year' },
  { key: 'runtime', label: 'Length' },
  { key: 'personal_rating', label: 'Rating' },
];

export default function SortMenu({ sort, dir, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = OPTIONS.find((o) => o.key === sort) || OPTIONS[0];
  const arrow = dir === 'asc' ? '↑' : '↓';

  function choose(key) {
    // Re-picking the already-active sort flips its direction instead of
    // being a no-op, matching the toolbar-button feel this is meant to have
    // even though it looks like a dropdown.
    onChange(key, key === sort ? (dir === 'asc' ? 'desc' : 'asc') : 'asc');
    setOpen(false);
  }

  return (
    <div className="sort-menu" ref={ref}>
      <button type="button" className="sort-menu-trigger" onClick={() => setOpen((o) => !o)}>
        Sort: {current.label} {arrow}
      </button>
      {open && (
        <div className="sort-menu-list" role="menu">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitemradio"
              aria-checked={o.key === sort}
              className={o.key === sort ? 'active' : ''}
              onClick={() => choose(o.key)}
            >
              {o.label} {o.key === sort ? arrow : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
