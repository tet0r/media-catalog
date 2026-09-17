import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [key, setKey] = useState('');
  const [source, setSource] = useState('none');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setKey(s.tmdb_api_key || '');
        setSource(s.tmdb_api_key_source);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function save() {
    setError(null);
    try {
      await api.updateSettings({ tmdb_api_key: key });
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
      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved!</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
