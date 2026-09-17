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
  searchTmdb: (q, year) =>
    fetch(`${BASE}/search/tmdb?q=${encodeURIComponent(q)}${year ? `&year=${encodeURIComponent(year)}` : ''}`).then(handle),
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
