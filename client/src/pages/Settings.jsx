import { useEffect, useState } from 'react';
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

export default function Settings() {
  const [key, setKey] = useState('');
  const [source, setSource] = useState('none');
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(60);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setKey(s.tmdb_api_key || '');
        setSource(s.tmdb_api_key_source);
        setAutoScanEnabled(!!s.auto_scan_enabled);
        setAutoScanInterval(s.auto_scan_interval_minutes || 60);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    setError(null);
    try {
      await api.updateSettings({
        tmdb_api_key: key,
        auto_scan_enabled: autoScanEnabled,
        auto_scan_interval_minutes: autoScanInterval,
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

      <hr />
      <h2>Automatic Library Scanning</h2>
      <p className="muted">
        Periodically re-scans your movie folders and adds new matches automatically — the same
        as clicking "Scan Now" on the Scan Library page, just on a timer. This checks on an
        interval rather than reacting instantly to file changes: real-time filesystem watching
        isn't reliable over network shares (SMB/CIFS), which is how libraries are mounted here.
      </p>
      <div className="form-grid">
        <label>
          Enabled
          <input
            type="checkbox"
            checked={autoScanEnabled}
            onChange={(e) => setAutoScanEnabled(e.target.checked)}
          />
        </label>
        <label>
          Check every
          <select
            value={autoScanInterval}
            onChange={(e) => setAutoScanInterval(Number(e.target.value))}
            disabled={!autoScanEnabled}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved!</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
