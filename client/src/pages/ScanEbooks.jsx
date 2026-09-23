import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import EbookPendingItem from '../components/EbookPendingItem.jsx';

export default function ScanEbooks() {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('review');
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const lastClickedIndexRef = useRef(null);

  const refresh = useCallback(() => {
    api.ebookScanStatus().then(setStatus).catch((err) => setError(err.message));
    api.ebookScanPending().then(setPending).catch((err) => setError(err.message));
    api.listIgnoredEbooks().then(setIgnored).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Selection can go stale once a scan re-populates `pending` (ids that no
  // longer exist would otherwise linger checked-but-invisible).
  useEffect(() => {
    setSelectedIds((prev) => {
      const stillValid = new Set(pending.map((p) => p.id));
      const next = new Set([...prev].filter((id) => stillValid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pending]);

  async function startScan() {
    setError(null);
    try {
      await api.startEbookScan();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resolve(id, key, skip) {
    setBusyId(id);
    try {
      await api.resolveEbookPending(id, { key, skip });
      setPending((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function ignoreOne(id) {
    setBusyId(id);
    try {
      await api.ignoreEbookPending(id);
      setPending((p) => p.filter((x) => x.id !== id));
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(index, id, shiftKey) {
    const lastIndex = lastClickedIndexRef.current;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastIndex !== null) {
        const [start, end] = [lastIndex, index].sort((a, b) => a - b);
        for (let i = start; i <= end; i++) next.add(pending[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIndexRef.current = index;
  }

  function selectAll() {
    setSelectedIds(new Set(pending.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }

  async function batchSkip() {
    setBatchBusy(true);
    setError(null);
    try {
      const ids = [...selectedIds];
      await api.batchSkipEbookPending(ids);
      setPending((p) => p.filter((x) => !selectedIds.has(x.id)));
      clearSelection();
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchIgnore() {
    setBatchBusy(true);
    setError(null);
    try {
      const ids = [...selectedIds];
      await api.batchIgnoreEbookPending(ids);
      setPending((p) => p.filter((x) => !selectedIds.has(x.id)));
      clearSelection();
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchBusy(false);
    }
  }

  async function unignore(id) {
    try {
      await api.unignoreEbook(id);
      setIgnored((list) => list.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  const allSelected = pending.length > 0 && selectedIds.size === pending.length;

  return (
    <div>
      <h1>Scan Library</h1>
      <p>
        Scans the ebook folder mounted into the container (see <code>docker-compose.yml</code>) for .epub/.pdf/
        .mobi/.azw3 files, and matches them against Open Library. Exact title matches are added automatically;
        anything uncertain lands below for you to confirm.
      </p>
      <button onClick={startScan} disabled={status?.running}>
        {status?.running ? 'Scanning...' : 'Scan Now'}
      </button>
      {status && (
        <div className="scan-status">
          <p>{status.message}</p>
          {status.files_found ? (
            <p>
              {status.files_found} files found · {status.matched} auto-matched · {status.pending} need review ·{' '}
              {status.skipped} skipped
              {status.errored ? <> · {status.errored} failed (network error — retried on next scan)</> : null}
              {status.removed ? <> · {status.removed} removed (file no longer found)</> : null}
            </p>
          ) : null}
          {status.last_run && <p className="muted">Last run: {new Date(status.last_run).toLocaleString()}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="picker-tabs" style={{ margin: '16px 0' }}>
        <button
          type="button"
          className={`picker-tab${activeTab === 'review' ? ' active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Needs Review ({pending.length})
        </button>
        <button
          type="button"
          className={`picker-tab${activeTab === 'ignored' ? ' active' : ''}`}
          onClick={() => setActiveTab('ignored')}
        >
          Ignored ({ignored.length})
        </button>
      </div>

      {activeTab === 'review' && (
        <>
          {pending.length === 0 && <p className="muted">Nothing needs review right now.</p>}
          {pending.length > 0 && (
            <div className="batch-actions-row">
              <label className="pending-select-row" style={{ display: 'inline-flex' }}>
                <input type="checkbox" checked={allSelected} onChange={() => (allSelected ? clearSelection() : selectAll())} />
                <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
              </label>
              <button className="muted-btn" disabled={selectedIds.size === 0 || batchBusy} onClick={batchSkip}>
                Skip Selected
              </button>
              <button className="muted-btn" disabled={selectedIds.size === 0 || batchBusy} onClick={batchIgnore}>
                Ignore Selected
              </button>
            </div>
          )}
          {pending.map((p, index) => (
            <EbookPendingItem
              key={p.id}
              item={p}
              busy={busyId === p.id}
              selected={selectedIds.has(p.id)}
              onToggleSelect={(shiftKey) => toggleSelect(index, p.id, shiftKey)}
              onResolve={(key, skip) => resolve(p.id, key, skip)}
              onIgnore={() => ignoreOne(p.id)}
            />
          ))}
        </>
      )}

      {activeTab === 'ignored' && (
        <>
          {ignored.length === 0 && <p className="muted">No ignored files.</p>}
          {ignored.length > 0 && (
            <p className="muted">These paths are permanently skipped — a scan will never surface them, even if the file is still there.</p>
          )}
          {ignored.map((item) => (
            <div key={item.id} className="pending-item ignored-item">
              <div className="pending-file">{item.file_path}</div>
              {item.guessed_title && <div className="pending-guess">Guessed: {item.guessed_title}</div>}
              <button className="muted-btn" onClick={() => unignore(item.id)}>Un-ignore</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
