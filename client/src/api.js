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
  searchTpdbPosters: (title, year) =>
    fetch(`${BASE}/images/tpdb-posters?title=${encodeURIComponent(title)}${year ? `&year=${encodeURIComponent(year)}` : ''}`).then(handle),
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
  getSettings: () => fetch(`${BASE}/settings`).then(handle),
  updateSettings: (payload) =>
    fetch(`${BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
};
