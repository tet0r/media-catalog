import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Shared by every library page's bulk-select feature. The actual Select
// toggle / "N selected" menu need to render in the top toolbar (which
// lives in App.jsx, a sibling of whichever library page is mounted), not
// inline in the page — so rather than lift selection state up into App
// (which would mean threading it through 7 different routes' props), each
// page keeps its own selection state and portals its bulk-action UI into
// a slot div App.jsx already renders in its toolbar. document.body-style
// portals don't need this lookup, but a slot that's part of the React
// tree only exists once the whole app has committed at least once, so the
// lookup happens in an effect (after commit) rather than during render.
export default function useBulkSelection() {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    setSlot(document.getElementById('bulk-actions-slot'));
  }, []);

  // Selection doesn't need to survive leaving the page — resetting it on
  // remount (which happens automatically since this state is local) is
  // exactly what you want, so a stale selection never lingers into a
  // different visit to the same library later.
  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function Portal({ children }) {
    if (!slot) return null;
    return createPortal(children, slot);
  }

  return { selectMode, setSelectMode, selectedIds, setSelectedIds, toggle, exitSelectMode, Portal };
}
