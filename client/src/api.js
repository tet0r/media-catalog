const BASE = '/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getHealth: () => fetch(`${BASE}/health`).then(handle),
  getVersionCheck: () => fetch(`${BASE}/version-check`).then(handle),
  listMovies: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/movies?${qs}`).then(handle);
  },
  getMovie: (id) => fetch(`${BASE}/movies/${id}`).then(handle),
  addMovie: (payload) =>
    fetch(`${BASE}/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  updateMovie: (id, payload) =>
    fetch(`${BASE}/movies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteMovie: (id) => fetch(`${BASE}/movies/${id}`, { method: 'DELETE' }).then(handle),
  refreshMovie: (id) => fetch(`${BASE}/movies/${id}/refresh`, { method: 'POST' }).then(handle),
  startBulkRefresh: () => fetch(`${BASE}/movies/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshStatus: () => fetch(`${BASE}/movies/refresh-all/status`).then(handle),
  setMoviePoster: (id, imageUrl) =>
    fetch(`${BASE}/movies/${id}/poster`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  setMovieBackdrop: (id, imageUrl) =>
    fetch(`${BASE}/movies/${id}/backdrop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadMoviePoster: (id, file) =>
    fetch(`${BASE}/movies/${id}/poster/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchTpdbPosters: (title, year) =>
    fetch(`${BASE}/images/tpdb-posters?title=${encodeURIComponent(title)}${year ? `&year=${encodeURIComponent(year)}` : ''}`).then(handle),
  searchTmdbPosters: (tmdbId) => fetch(`${BASE}/images/posters/${tmdbId}`).then(handle),
  searchTmdbBackdrops: (tmdbId) => fetch(`${BASE}/images/backdrops/${tmdbId}`).then(handle),
  searchTmdb: (q, year) =>
    fetch(`${BASE}/search/tmdb?q=${encodeURIComponent(q)}${year ? `&year=${encodeURIComponent(year)}` : ''}`).then(handle),
  lookupTmdbUrl: (url) => fetch(`${BASE}/search/tmdb-url?url=${encodeURIComponent(url)}`).then(handle),
  startScan: () => fetch(`${BASE}/scan`, { method: 'POST' }).then(handle),
  scanStatus: () => fetch(`${BASE}/scan/status`).then(handle),
  scanPending: () => fetch(`${BASE}/scan/pending`).then(handle),
  resolvePending: (id, payload) =>
    fetch(`${BASE}/scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreMoviePending: (id) => fetch(`${BASE}/scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipMoviePending: (ids) =>
    fetch(`${BASE}/scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreMoviePending: (ids) =>
    fetch(`${BASE}/scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredMovies: () => fetch(`${BASE}/scan/ignored`).then(handle),
  unignoreMovie: (id) => fetch(`${BASE}/scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
  clearMovieLibrary: () => fetch(`${BASE}/movies/clear-all`, { method: 'POST' }).then(handle),
  clearAudiobookLibrary: () => fetch(`${BASE}/audiobooks/clear-all`, { method: 'POST' }).then(handle),
  getSettings: () => fetch(`${BASE}/settings`).then(handle),
  updateSettings: (payload) =>
    fetch(`${BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),

  listAudiobooks: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/audiobooks?${qs}`).then(handle);
  },
  getAudiobook: (id) => fetch(`${BASE}/audiobooks/${id}`).then(handle),
  addAudiobook: (payload) =>
    fetch(`${BASE}/audiobooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  updateAudiobook: (id, payload) =>
    fetch(`${BASE}/audiobooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteAudiobook: (id) => fetch(`${BASE}/audiobooks/${id}`, { method: 'DELETE' }).then(handle),
  refreshAudiobook: (id) => fetch(`${BASE}/audiobooks/${id}/refresh`, { method: 'POST' }).then(handle),
  startBulkRefreshAudiobooks: () => fetch(`${BASE}/audiobooks/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshAudiobooksStatus: () => fetch(`${BASE}/audiobooks/refresh-all/status`).then(handle),
  setAudiobookCover: (id, imageUrl) =>
    fetch(`${BASE}/audiobooks/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadAudiobookCover: (id, file) =>
    fetch(`${BASE}/audiobooks/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchAudible: (q) => fetch(`${BASE}/search/audible?q=${encodeURIComponent(q)}`).then(handle),
  lookupAudibleUrl: (url) => fetch(`${BASE}/search/audible-url?url=${encodeURIComponent(url)}`).then(handle),
  searchApple: (q) => fetch(`${BASE}/search/apple?q=${encodeURIComponent(q)}`).then(handle),
  lookupAppleUrl: (url) => fetch(`${BASE}/search/apple-url?url=${encodeURIComponent(url)}`).then(handle),
  startAudiobookScan: () => fetch(`${BASE}/audiobook-scan`, { method: 'POST' }).then(handle),
  audiobookScanStatus: () => fetch(`${BASE}/audiobook-scan/status`).then(handle),
  audiobookScanPending: () => fetch(`${BASE}/audiobook-scan/pending`).then(handle),
  resolveAudiobookPending: (id, payload) =>
    fetch(`${BASE}/audiobook-scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreAudiobookPending: (id) => fetch(`${BASE}/audiobook-scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipAudiobookPending: (ids) =>
    fetch(`${BASE}/audiobook-scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreAudiobookPending: (ids) =>
    fetch(`${BASE}/audiobook-scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredAudiobooks: () => fetch(`${BASE}/audiobook-scan/ignored`).then(handle),
  unignoreAudiobook: (id) => fetch(`${BASE}/audiobook-scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
};
