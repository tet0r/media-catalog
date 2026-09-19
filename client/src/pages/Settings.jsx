import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const INTERVAL_OPTIONS = [
  { label: 'Every 15 minutes', value: 15 },
  { label: 'Every 30 minutes', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 3 hours', value: 180 },
  { label: 'Every 6 hours', value: 360 },
  { label: 'Every 12 hours', value: 720 },
  { label: 'Every 24 hours', value: 1440 },
];

function IntervalSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} className="auto-scan-interval">
      {INTERVAL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function Settings() {
  const [key, setKey] = useState('');
  const [source, setSource] = useState('none');
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(60);
  const [autoPruneMissing, setAutoPruneMissing] = useState(false);
  const [audiobookAutoScanEnabled, setAudiobookAutoScanEnabled] = useState(false);
  const [audiobookAutoScanInterval, setAudiobookAutoScanInterval] = useState(60);
  const [audiobookAutoPruneMissing, setAudiobookAutoPruneMissing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [bulkStatus, setBulkStatus] = useState(null);
  const [audiobookBulkStatus, setAudiobookBulkStatus] = useState(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setKey(s.tmdb_api_key || '');
        setSource(s.tmdb_api_key_source);
        setAutoScanEnabled(!!s.auto_scan_enabled);
        setAutoScanInterval(s.auto_scan_interval_minutes || 60);
        setAutoPruneMissing(!!s.auto_prune_missing);
        setAudiobookAutoScanEnabled(!!s.audiobook_auto_scan_enabled);
        setAudiobookAutoScanInterval(s.audiobook_auto_scan_interval_minutes || 60);
        setAudiobookAutoPruneMissing(!!s.audiobook_auto_prune_missing);
      })
      .catch((err) => setError(err.message));
  }, []);

  const refreshBulkStatus = useCallback(() => {
    api.bulkRefreshStatus().then(setBulkStatus).catch(() => {});
    api.bulkRefreshAudiobooksStatus().then(setAudiobookBulkStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refreshBulkStatus();
    const interval = setInterval(refreshBulkStatus, 2000);
    return () => clearInterval(interval);
  }, [refreshBulkStatus]);

  async function startBulkRefresh() {
    setError(null);
    try {
      await api.startBulkRefresh();
      refreshBulkStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startAudiobookBulkRefresh() {
    setError(null);
    try {
      await api.startBulkRefreshAudiobooks();
      refreshBulkStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    setError(null);
    try {
      await api.updateSettings({
        tmdb_api_key: key,
        auto_scan_enabled: autoScanEnabled,
        auto_scan_interval_minutes: autoScanInterval,
        auto_prune_missing: autoPruneMissing,
        audiobook_auto_scan_enabled: audiobookAutoScanEnabled,
        audiobook_auto_scan_interval_minutes: audiobookAutoScanInterval,
        audiobook_auto_prune_missing: audiobookAutoPruneMissing,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Settings</h1>

      <h2>Movies</h2>
      <div className="form-grid">
        <label>
          TMDB API Key
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Get a free key at themoviedb.org" />
        </label>
      </div>
      <p className="muted">
        Current source:{' '}
        {source === 'env'
          ? 'environment variable (TMDB_API_KEY)'
          : source === 'settings'
          ? 'saved here'
          : 'not configured'}
        . Get a free API key at{' '}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
          themoviedb.org/settings/api
        </a>
        .
      </p>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input type="checkbox" checked={autoScanEnabled} onChange={(e) => setAutoScanEnabled(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically scan for new movies</span>
        <IntervalSelect value={autoScanInterval} onChange={setAutoScanInterval} disabled={!autoScanEnabled} />
      </div>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input type="checkbox" checked={autoPruneMissing} onChange={(e) => setAutoPruneMissing(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Remove movies whose file is no longer found</span>
      </div>

      <p className="muted">
        Runs during every scan (manual or automatic). Skipped for any share that returns zero
        files that scan, so a briefly-disconnected network mount can't wipe out your collection.
      </p>

      <h3>Bulk Actions</h3>
      <p className="muted">
        Re-fetches every movie's metadata from TMDB in place — the same as clicking "Refresh
        Metadata" on a movie's page, done for the whole collection at once. Doesn't touch
        posters/backdrops, so any custom picks are left alone.
      </p>
      <button onClick={startBulkRefresh} disabled={bulkStatus?.running}>
        {bulkStatus?.running ? 'Refreshing...' : 'Refresh All Metadata'}
      </button>
      {bulkStatus && bulkStatus.message !== 'Idle' && <p className="muted"> {bulkStatus.message}</p>}

      <hr />
      <h2>Audiobooks</h2>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={audiobookAutoScanEnabled}
            onChange={(e) => setAudiobookAutoScanEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically scan for new audiobooks</span>
        <IntervalSelect value={audiobookAutoScanInterval} onChange={setAudiobookAutoScanInterval} disabled={!audiobookAutoScanEnabled} />
      </div>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={audiobookAutoPruneMissing}
            onChange={(e) => setAudiobookAutoPruneMissing(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Remove audiobooks whose file is no longer found</span>
      </div>

      <p className="muted">
        Same safety net as movies: skipped for any share that returns zero audiobooks that scan,
        so a briefly-disconnected network mount can't wipe out your collection.
      </p>

      <h3>Bulk Actions</h3>
      <p className="muted">
        Re-fetches every audiobook's metadata from Audible/Audnexus in place. Doesn't touch covers,
        so any custom upload is left alone.
      </p>
      <button onClick={startAudiobookBulkRefresh} disabled={audiobookBulkStatus?.running}>
        {audiobookBulkStatus?.running ? 'Refreshing...' : 'Refresh All Metadata'}
      </button>
      {audiobookBulkStatus && audiobookBulkStatus.message !== 'Idle' && <p className="muted"> {audiobookBulkStatus.message}</p>}

      <hr />
      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved!</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
