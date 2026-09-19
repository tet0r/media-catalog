import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import AudiobookPendingItem from '../components/AudiobookPendingItem.jsx';

export default function ScanAudiobooks() {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(() => {
    api.audiobookScanStatus().then(setStatus).catch((err) => setError(err.message));
    api.audiobookScanPending().then(setPending).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function startScan() {
    setError(null);
    try {
      await api.startAudiobookScan();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resolve(id, asin, skip, source) {
    setBusyId(id);
    try {
      await api.resolveAudiobookPending(id, { asin, skip, source });
      setPending((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1>Scan Library</h1>
      <p>
        Scans the audiobook folder mounted into the container (see <code>docker-compose.yml</code>) and matches
        each book against Audible. A folder with an .m4b file is treated as one book; a folder of .mp3/.m4a parts
        with no .m4b is treated as one multi-part book — either way, each folder becomes exactly one entry, never
        one per file. Exact title matches are added automatically; anything uncertain lands below for you to confirm
        — where you can also search Apple Books instead, in case Audible's catalog doesn't have it.
      </p>
      <button onClick={startScan} disabled={status?.running}>
        {status?.running ? 'Scanning...' : 'Scan Now'}
      </button>
      {status && (
        <div className="scan-status">
          <p>{status.message}</p>
          {status.files_found ? (
            <p>
              {status.files_found} audiobooks found · {status.matched} auto-matched · {status.pending} need review ·{' '}
              {status.skipped} skipped
              {status.errored ? <> · {status.errored} failed (network error — retried on next scan)</> : null}
              {status.removed ? <> · {status.removed} removed (file no longer found)</> : null}
            </p>
          ) : null}
          {status.last_run && <p className="muted">Last run: {new Date(status.last_run).toLocaleString()}</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {pending.length > 0 && (
        <>
          <h2>Needs Review ({pending.length})</h2>
          {pending.map((p) => (
            <AudiobookPendingItem
              key={p.id}
              item={p}
              busy={busyId === p.id}
              onResolve={(asin, skip, source) => resolve(p.id, asin, skip, source)}
            />
          ))}
        </>
      )}
    </div>
  );
}
