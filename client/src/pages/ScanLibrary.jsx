import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function ScanLibrary() {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(() => {
    api.scanStatus().then(setStatus).catch((err) => setError(err.message));
    api.scanPending().then(setPending).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function startScan() {
    setError(null);
    try {
      await api.startScan();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resolve(id, tmdb_id, skip) {
    setBusyId(id);
    try {
      await api.resolvePending(id, { tmdb_id, skip });
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
        Scans the movie folder mounted into the container (see <code>docker-compose.yml</code>) for video files, and
        matches them against TMDB. Exact title + year matches are added automatically; anything uncertain lands
        below for you to confirm.
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
            <div key={p.id} className="pending-item">
              <div className="pending-file">{p.file_path}</div>
              <div className="pending-guess">
                Guessed: {p.guessed_title} {p.guessed_year ? `(${p.guessed_year})` : ''}
              </div>
              <div className="candidates">
                {p.candidates.length === 0 && <span className="muted">No TMDB matches found.</span>}
                {p.candidates.map((c) => (
                  <div key={c.tmdb_id} className="candidate">
                    {c.poster_url ? <img src={c.poster_url} alt={c.title} /> : null}
                    <span>{c.title} ({c.year})</span>
                    <button disabled={busyId === p.id} onClick={() => resolve(p.id, c.tmdb_id, false)}>
                      Use this
                    </button>
                  </div>
                ))}
                <button className="muted-btn" disabled={busyId === p.id} onClick={() => resolve(p.id, null, true)}>
                  Skip this file
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
