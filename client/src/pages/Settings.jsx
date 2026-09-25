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
  const [ebookAutoScanEnabled, setEbookAutoScanEnabled] = useState(false);
  const [ebookAutoScanInterval, setEbookAutoScanInterval] = useState(60);
  const [ebookAutoPruneMissing, setEbookAutoPruneMissing] = useState(false);
  const [albumAutoScanEnabled, setAlbumAutoScanEnabled] = useState(false);
  const [albumAutoScanInterval, setAlbumAutoScanInterval] = useState(60);
  const [albumAutoPruneMissing, setAlbumAutoPruneMissing] = useState(false);
  const [lastfmKey, setLastfmKey] = useState('');
  const [lastfmSource, setLastfmSource] = useState('none');
  const [discogsUsername, setDiscogsUsername] = useState('');
  const [discogsToken, setDiscogsToken] = useState('');
  const [discogsSource, setDiscogsSource] = useState('none');
  const [vinylAutoSyncEnabled, setVinylAutoSyncEnabled] = useState(false);
  const [vinylAutoSyncInterval, setVinylAutoSyncInterval] = useState(60);
  const [gamesAutoSyncEnabled, setGamesAutoSyncEnabled] = useState(false);
  const [gamesAutoSyncInterval, setGamesAutoSyncInterval] = useState(60);
  const [launchboxDirConfigured, setLaunchboxDirConfigured] = useState(false);
  const [tvdbKey, setTvdbKey] = useState('');
  const [tvdbSource, setTvdbSource] = useState('none');
  const [tvdbPin, setTvdbPin] = useState('');
  const [tvAutoScanEnabled, setTvAutoScanEnabled] = useState(false);
  const [tvAutoScanInterval, setTvAutoScanInterval] = useState(60);
  const [tvAutoPruneMissing, setTvAutoPruneMissing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [bulkStatus, setBulkStatus] = useState(null);
  const [audiobookBulkStatus, setAudiobookBulkStatus] = useState(null);
  const [ebookBulkStatus, setEbookBulkStatus] = useState(null);
  const [albumBulkStatus, setAlbumBulkStatus] = useState(null);
  const [clearingMovies, setClearingMovies] = useState(false);
  const [clearingAudiobooks, setClearingAudiobooks] = useState(false);
  const [clearingEbooks, setClearingEbooks] = useState(false);
  const [clearingAlbums, setClearingAlbums] = useState(false);
  const [clearingVinyl, setClearingVinyl] = useState(false);
  const [clearingGames, setClearingGames] = useState(false);
  const [clearingTv, setClearingTv] = useState(false);
  const [tvBulkStatus, setTvBulkStatus] = useState(null);
  const [clearMessage, setClearMessage] = useState(null);

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
        setEbookAutoScanEnabled(!!s.ebook_auto_scan_enabled);
        setEbookAutoScanInterval(s.ebook_auto_scan_interval_minutes || 60);
        setEbookAutoPruneMissing(!!s.ebook_auto_prune_missing);
        setAlbumAutoScanEnabled(!!s.album_auto_scan_enabled);
        setAlbumAutoScanInterval(s.album_auto_scan_interval_minutes || 60);
        setAlbumAutoPruneMissing(!!s.album_auto_prune_missing);
        setLastfmKey(s.lastfm_api_key || '');
        setLastfmSource(s.lastfm_api_key_source);
        setDiscogsUsername(s.discogs_username || '');
        setDiscogsToken(s.discogs_token || '');
        setDiscogsSource(s.discogs_source);
        setVinylAutoSyncEnabled(!!s.vinyl_auto_sync_enabled);
        setVinylAutoSyncInterval(s.vinyl_auto_sync_interval_minutes || 60);
        setGamesAutoSyncEnabled(!!s.games_auto_sync_enabled);
        setGamesAutoSyncInterval(s.games_auto_sync_interval_minutes || 60);
        setLaunchboxDirConfigured(!!s.launchbox_dir_configured);
        setTvdbKey(s.tvdb_api_key || '');
        setTvdbSource(s.tvdb_api_key_source);
        setTvdbPin(s.tvdb_pin || '');
        setTvAutoScanEnabled(!!s.tv_auto_scan_enabled);
        setTvAutoScanInterval(s.tv_auto_scan_interval_minutes || 60);
        setTvAutoPruneMissing(!!s.tv_auto_prune_missing);
      })
      .catch((err) => setError(err.message));
  }, []);

  const refreshBulkStatus = useCallback(() => {
    api.bulkRefreshStatus().then(setBulkStatus).catch(() => {});
    api.bulkRefreshAudiobooksStatus().then(setAudiobookBulkStatus).catch(() => {});
    api.bulkRefreshEbooksStatus().then(setEbookBulkStatus).catch(() => {});
    api.bulkRefreshAlbumsStatus().then(setAlbumBulkStatus).catch(() => {});
    api.bulkRefreshTvStatus().then(setTvBulkStatus).catch(() => {});
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

  async function clearMovies() {
    if (!confirm('Permanently delete every movie in your collection? This cannot be undone.')) return;
    setClearingMovies(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearMovieLibrary();
      setClearMessage(`Removed ${count} movie${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingMovies(false);
    }
  }

  async function clearAudiobooks() {
    if (!confirm('Permanently delete every audiobook in your collection? This cannot be undone.')) return;
    setClearingAudiobooks(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearAudiobookLibrary();
      setClearMessage(`Removed ${count} audiobook${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingAudiobooks(false);
    }
  }

  async function startEbookBulkRefresh() {
    setError(null);
    try {
      await api.startBulkRefreshEbooks();
      refreshBulkStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearEbooks() {
    if (!confirm('Permanently delete every ebook in your collection? This cannot be undone.')) return;
    setClearingEbooks(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearEbookLibrary();
      setClearMessage(`Removed ${count} ebook${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingEbooks(false);
    }
  }

  async function startAlbumBulkRefresh() {
    setError(null);
    try {
      await api.startBulkRefreshAlbums();
      refreshBulkStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearAlbums() {
    if (!confirm('Permanently delete every album in your collection? This cannot be undone.')) return;
    setClearingAlbums(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearAlbumLibrary();
      setClearMessage(`Removed ${count} album${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingAlbums(false);
    }
  }

  async function clearVinyl() {
    if (!confirm('Delete the local copy of your vinyl collection? It will come back on the next Discogs sync — this does not touch your actual Discogs collection.')) return;
    setClearingVinyl(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearVinylLibrary();
      setClearMessage(`Removed ${count} record${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingVinyl(false);
    }
  }

  async function clearGames() {
    if (!confirm('Delete the local copy of your game library? It will come back on the next LaunchBox sync — this does not touch your actual LaunchBox installation.')) return;
    setClearingGames(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearGamesLibrary();
      setClearMessage(`Removed ${count} game${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingGames(false);
    }
  }

  async function startTvBulkRefresh() {
    setError(null);
    try {
      await api.startBulkRefreshTv();
      refreshBulkStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function clearTv() {
    if (!confirm('Permanently delete every TV show in your collection? This cannot be undone.')) return;
    setClearingTv(true);
    setError(null);
    setClearMessage(null);
    try {
      const { count } = await api.clearTvLibrary();
      setClearMessage(`Removed ${count} show${count === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingTv(false);
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
        ebook_auto_scan_enabled: ebookAutoScanEnabled,
        ebook_auto_scan_interval_minutes: ebookAutoScanInterval,
        ebook_auto_prune_missing: ebookAutoPruneMissing,
        album_auto_scan_enabled: albumAutoScanEnabled,
        album_auto_scan_interval_minutes: albumAutoScanInterval,
        album_auto_prune_missing: albumAutoPruneMissing,
        lastfm_api_key: lastfmKey,
        discogs_username: discogsUsername,
        discogs_token: discogsToken,
        vinyl_auto_sync_enabled: vinylAutoSyncEnabled,
        vinyl_auto_sync_interval_minutes: vinylAutoSyncInterval,
        games_auto_sync_enabled: gamesAutoSyncEnabled,
        games_auto_sync_interval_minutes: gamesAutoSyncInterval,
        tvdb_api_key: tvdbKey,
        tvdb_pin: tvdbPin,
        tv_auto_scan_enabled: tvAutoScanEnabled,
        tv_auto_scan_interval_minutes: tvAutoScanInterval,
        tv_auto_prune_missing: tvAutoPruneMissing,
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

      <h3>Danger Zone</h3>
      <p className="muted">Permanently deletes every movie in your collection, along with their cached posters/backdrops.</p>
      <button className="danger" onClick={clearMovies} disabled={clearingMovies}>
        {clearingMovies ? 'Clearing...' : 'Clear Movie Library'}
      </button>

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

      <h3>Danger Zone</h3>
      <p className="muted">Permanently deletes every audiobook in your collection, along with their cached covers.</p>
      <button className="danger" onClick={clearAudiobooks} disabled={clearingAudiobooks}>
        {clearingAudiobooks ? 'Clearing...' : 'Clear Audiobook Library'}
      </button>

      <hr />
      <h2>Ebooks</h2>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={ebookAutoScanEnabled}
            onChange={(e) => setEbookAutoScanEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically scan for new ebooks</span>
        <IntervalSelect value={ebookAutoScanInterval} onChange={setEbookAutoScanInterval} disabled={!ebookAutoScanEnabled} />
      </div>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={ebookAutoPruneMissing}
            onChange={(e) => setEbookAutoPruneMissing(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Remove ebooks whose file is no longer found</span>
      </div>

      <p className="muted">
        Same safety net as movies/audiobooks: skipped for any share that returns zero ebooks that scan,
        so a briefly-disconnected network mount can't wipe out your collection.
      </p>

      <h3>Bulk Actions</h3>
      <p className="muted">
        Re-fetches every ebook's metadata from Open Library in place. Doesn't touch covers,
        so any custom upload is left alone.
      </p>
      <button onClick={startEbookBulkRefresh} disabled={ebookBulkStatus?.running}>
        {ebookBulkStatus?.running ? 'Refreshing...' : 'Refresh All Metadata'}
      </button>
      {ebookBulkStatus && ebookBulkStatus.message !== 'Idle' && <p className="muted"> {ebookBulkStatus.message}</p>}

      <h3>Danger Zone</h3>
      <p className="muted">Permanently deletes every ebook in your collection, along with their cached covers.</p>
      <button className="danger" onClick={clearEbooks} disabled={clearingEbooks}>
        {clearingEbooks ? 'Clearing...' : 'Clear Ebook Library'}
      </button>

      <hr />
      <h2>Music — Albums</h2>

      <div className="form-grid">
        <label>
          Last.fm API Key
          <input value={lastfmKey} onChange={(e) => setLastfmKey(e.target.value)} placeholder="Get a free key at last.fm/api/account/create" />
        </label>
      </div>
      <p className="muted">
        Current source:{' '}
        {lastfmSource === 'env'
          ? 'environment variable (LASTFM_API_KEY)'
          : lastfmSource === 'settings'
          ? 'saved here'
          : 'not configured'}
        . Optional — MusicBrainz needs no key and works without this; a key here just enables
        Last.fm as a second search source in Add Album and Needs Review. Get a free one at{' '}
        <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
          last.fm/api/account/create
        </a>
        .
      </p>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={albumAutoScanEnabled}
            onChange={(e) => setAlbumAutoScanEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically scan for new albums</span>
        <IntervalSelect value={albumAutoScanInterval} onChange={setAlbumAutoScanInterval} disabled={!albumAutoScanEnabled} />
      </div>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={albumAutoPruneMissing}
            onChange={(e) => setAlbumAutoPruneMissing(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Remove albums whose folder is no longer found</span>
      </div>

      <p className="muted">
        Same safety net as movies/audiobooks/ebooks: skipped for any share that returns zero albums
        that scan, so a briefly-disconnected network mount can't wipe out your collection.
      </p>

      <h3>Bulk Actions</h3>
      <p className="muted">
        Re-fetches every album's metadata from MusicBrainz in place. MusicBrainz limits requests to
        1/second, so this is slower than the other media types' bulk refresh. Doesn't touch covers,
        so any custom upload is left alone.
      </p>
      <button onClick={startAlbumBulkRefresh} disabled={albumBulkStatus?.running}>
        {albumBulkStatus?.running ? 'Refreshing...' : 'Refresh All Metadata'}
      </button>
      {albumBulkStatus && albumBulkStatus.message !== 'Idle' && <p className="muted"> {albumBulkStatus.message}</p>}

      <h3>Danger Zone</h3>
      <p className="muted">Permanently deletes every album in your collection, along with their cached covers.</p>
      <button className="danger" onClick={clearAlbums} disabled={clearingAlbums}>
        {clearingAlbums ? 'Clearing...' : 'Clear Album Library'}
      </button>

      <hr />
      <h2>Music — Vinyl</h2>
      <p className="muted">
        Vinyl is a direct mirror of your existing collection on{' '}
        <a href="https://www.discogs.com" target="_blank" rel="noreferrer">Discogs</a> — there's no
        local-file scanning involved. Generate a token at{' '}
        <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">
          discogs.com/settings/developers
        </a>{' '}
        ("Generate new token"), then enter it and your username below.
      </p>
      <div className="form-grid">
        <label>
          Discogs Username
          <input value={discogsUsername} onChange={(e) => setDiscogsUsername(e.target.value)} placeholder="Your Discogs username" />
        </label>
        <label>
          Discogs Personal Access Token
          <input value={discogsToken} onChange={(e) => setDiscogsToken(e.target.value)} placeholder="Paste your token" />
        </label>
      </div>
      <p className="muted">
        Current source:{' '}
        {discogsSource === 'env'
          ? 'environment variables (DISCOGS_USERNAME/DISCOGS_TOKEN)'
          : discogsSource === 'settings'
          ? 'saved here'
          : 'not configured'}
        .
      </p>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={vinylAutoSyncEnabled}
            onChange={(e) => setVinylAutoSyncEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically sync with Discogs</span>
        <IntervalSelect value={vinylAutoSyncInterval} onChange={setVinylAutoSyncInterval} disabled={!vinylAutoSyncEnabled} />
      </div>

      <h3>Danger Zone</h3>
      <p className="muted">
        Deletes the local copy of your vinyl collection, along with their cached covers. It comes back
        on the next sync — this never touches your actual Discogs collection.
      </p>
      <button className="danger" onClick={clearVinyl} disabled={clearingVinyl}>
        {clearingVinyl ? 'Clearing...' : 'Clear Local Vinyl Copy'}
      </button>

      <hr />
      <h2>Games</h2>
      <p className="muted">
        Games is a direct mirror of your local{' '}
        <a href="https://www.launchbox-app.com" target="_blank" rel="noreferrer">LaunchBox</a>{' '}
        installation — LaunchBox has already matched and identified these games, so there's no
        catalog search here, just a read of its <code>Data</code>/<code>Images</code> folders.
        Since LaunchBox usually runs on a different PC than this server, copy (or keep synced) its{' '}
        <code>Data</code> folder and <code>Images</code> folder (or just each platform's{' '}
        <code>Box - Front</code> subfolder, to save space) to somewhere this server's Docker host
        can reach, then bind-mount that folder and set <code>LAUNCHBOX_DIR</code> to it — see the
        README's Games section for the exact <code>docker-compose.yml</code> lines.
      </p>
      <p className="muted">
        <code>LAUNCHBOX_DIR</code>: {launchboxDirConfigured ? 'configured' : 'not configured'}.
      </p>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={gamesAutoSyncEnabled}
            onChange={(e) => setGamesAutoSyncEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically sync with LaunchBox</span>
        <IntervalSelect value={gamesAutoSyncInterval} onChange={setGamesAutoSyncInterval} disabled={!gamesAutoSyncEnabled} />
      </div>

      <h3>Danger Zone</h3>
      <p className="muted">
        Deletes the local copy of your game library, along with their cached covers. It comes back
        on the next sync — this never touches your actual LaunchBox installation.
      </p>
      <button className="danger" onClick={clearGames} disabled={clearingGames}>
        {clearingGames ? 'Clearing...' : 'Clear Local Games Copy'}
      </button>

      <hr />
      <h2>TV Shows</h2>
      <div className="form-grid">
        <label>
          TheTVDB API Key
          <input value={tvdbKey} onChange={(e) => setTvdbKey(e.target.value)} placeholder="Get a free key from your TheTVDB dashboard" />
        </label>
        <label>
          TheTVDB Subscriber PIN (optional)
          <input value={tvdbPin} onChange={(e) => setTvdbPin(e.target.value)} placeholder="Only needed for a subscriber-supported key" />
        </label>
      </div>
      <p className="muted">
        Current source:{' '}
        {tvdbSource === 'env'
          ? 'environment variable (TVDB_API_KEY)'
          : tvdbSource === 'settings'
          ? 'saved here'
          : 'not configured'}
        . Create a free account and generate a key from your{' '}
        <a href="https://www.thetvdb.com/dashboard/account/apikeys" target="_blank" rel="noreferrer">
          TheTVDB dashboard
        </a>
        . Free for personal use — TheTVDB requires attribution, so this app credits them in its README.
      </p>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input type="checkbox" checked={tvAutoScanEnabled} onChange={(e) => setTvAutoScanEnabled(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Automatically scan for new TV shows</span>
        <IntervalSelect value={tvAutoScanInterval} onChange={setTvAutoScanInterval} disabled={!tvAutoScanEnabled} />
      </div>

      <div className="auto-scan-row">
        <label className="toggle-switch">
          <input type="checkbox" checked={tvAutoPruneMissing} onChange={(e) => setTvAutoPruneMissing(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
        <span className="auto-scan-label">Remove shows whose folder is no longer found</span>
      </div>

      <p className="muted">
        Same safety net as the other media types: skipped for any share that returns zero show
        folders that scan, so a briefly-disconnected network mount can't wipe out your collection.
      </p>

      <h3>Bulk Actions</h3>
      <p className="muted">
        Re-fetches every show's metadata from TheTVDB in place. Doesn't touch posters/backdrops,
        so any custom pick is left alone.
      </p>
      <button onClick={startTvBulkRefresh} disabled={tvBulkStatus?.running}>
        {tvBulkStatus?.running ? 'Refreshing...' : 'Refresh All Metadata'}
      </button>
      {tvBulkStatus && tvBulkStatus.message !== 'Idle' && <p className="muted"> {tvBulkStatus.message}</p>}

      <h3>Danger Zone</h3>
      <p className="muted">Permanently deletes every TV show in your collection, along with their cached posters/backdrops.</p>
      <button className="danger" onClick={clearTv} disabled={clearingTv}>
        {clearingTv ? 'Clearing...' : 'Clear TV Library'}
      </button>

      <hr />
      {clearMessage && <p className="muted">{clearMessage}</p>}
      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved!</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
