import { useState } from 'react';

// Editor for a media type's catalog folder(s). In the packaged desktop app
// "Browse..." opens a native folder dialog (window.desktop, from the Electron
// preload); in a browser/Docker there's no way to browse the server's
// filesystem from the page, so folders are typed as paths instead — the
// same container paths the compose file's mounts have always used.
//
// `source` says where the current list came from: 'settings' (picked here),
// 'env' (an environment variable), or 'default' (the built-in container
// path). Only 'settings' can be reverted, so that's when "Use default"
// shows.
export default function FolderList({ dirs, source, single = false, help, onChange, onReset }) {
  const [draft, setDraft] = useState('');
  const canBrowse = !!window.desktop?.chooseFolder;

  function add(path) {
    const p = (path || '').trim();
    if (!p) return;
    if (single) {
      onChange([p]);
    } else if (!dirs.includes(p)) {
      onChange([...dirs, p]);
    }
    setDraft('');
  }

  async function browse() {
    const picked = await window.desktop.chooseFolder();
    if (picked) add(picked);
  }

  return (
    <div className="folder-list">
      {help && <p className="muted">{help}</p>}

      {dirs.length === 0 ? (
        <p className="muted folder-empty">No {single ? 'folder' : 'folders'} chosen yet.</p>
      ) : (
        <div className="backup-list">
          {dirs.map((d) => (
            <div key={d} className="backup-item">
              <span className="backup-item-name">{d}</span>
              <button type="button" className="muted-btn" onClick={() => onChange(dirs.filter((x) => x !== d))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pending-search-row">
        {canBrowse && (
          <button type="button" onClick={browse}>
            Browse...
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={canBrowse ? 'or type a path' : single ? 'Path to the folder' : 'Path to a folder to add'}
        />
        <button type="button" className="muted-btn" onClick={() => add(draft)} disabled={!draft.trim()}>
          {single ? 'Set' : 'Add'}
        </button>
      </div>

      <p className="muted folder-source">
        {source === 'settings' && 'Set here.'}
        {source === 'env' && 'Currently coming from an environment variable — choosing a folder here overrides it.'}
        {source === 'default' && !canBrowse && 'Currently using the default container path.'}
        {source === 'settings' && onReset && !canBrowse && (
          <>
            {' '}
            <button type="button" className="link-btn" onClick={onReset}>
              Use default
            </button>
          </>
        )}
      </p>
    </div>
  );
}
