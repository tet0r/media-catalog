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
  rematchMovie: (id, payload) =>
    fetch(`${BASE}/movies/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
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
  listCollections: () => fetch(`${BASE}/collections`).then(handle),
  getCollection: (id) => fetch(`${BASE}/collections/${id}`).then(handle),
  createCollection: (name) =>
    fetch(`${BASE}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(handle),
  renameCollection: (id, name) =>
    fetch(`${BASE}/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(handle),
  deleteCollection: (id) => fetch(`${BASE}/collections/${id}`, { method: 'DELETE' }).then(handle),
  addMovieToCollection: (id, movieId) =>
    fetch(`${BASE}/collections/${id}/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movie_id: movieId }),
    }).then(handle),
  removeMovieFromCollection: (id, movieId) =>
    fetch(`${BASE}/collections/${id}/movies/${movieId}`, { method: 'DELETE' }).then(handle),
  searchCollectionImages: (q, source) =>
    fetch(`${BASE}/collections/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  mergeCollections: (sourceIds, targetId, targetName) =>
    fetch(`${BASE}/collections/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceIds, targetId, targetName }),
    }).then(handle),
  setCollectionCover: (id, imageUrl) =>
    fetch(`${BASE}/collections/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadCollectionCover: (id, file) =>
    fetch(`${BASE}/collections/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteCollectionCover: (id) => fetch(`${BASE}/collections/${id}/cover`, { method: 'DELETE' }).then(handle),
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
  rematchAudiobook: (id, payload) =>
    fetch(`${BASE}/audiobooks/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
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

  listAudiobookAuthorImages: () => fetch(`${BASE}/audiobooks/authors/images`).then(handle),
  searchAudiobookAuthorImages: (q, source) =>
    fetch(`${BASE}/audiobooks/authors/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameAudiobookAuthors: (sourceNames, targetName) =>
    fetch(`${BASE}/audiobooks/authors/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setAudiobookAuthorCover: (name, imageUrl) =>
    fetch(`${BASE}/audiobooks/authors/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadAudiobookAuthorCover: (name, file) =>
    fetch(`${BASE}/audiobooks/authors/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteAudiobookAuthorCover: (name) => fetch(`${BASE}/audiobooks/authors/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listEbooks: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/ebooks?${qs}`).then(handle);
  },
  getEbook: (id) => fetch(`${BASE}/ebooks/${id}`).then(handle),
  addEbook: (payload) =>
    fetch(`${BASE}/ebooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  updateEbook: (id, payload) =>
    fetch(`${BASE}/ebooks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteEbook: (id) => fetch(`${BASE}/ebooks/${id}`, { method: 'DELETE' }).then(handle),
  refreshEbook: (id) => fetch(`${BASE}/ebooks/${id}/refresh`, { method: 'POST' }).then(handle),
  rematchEbook: (id, payload) =>
    fetch(`${BASE}/ebooks/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  startBulkRefreshEbooks: () => fetch(`${BASE}/ebooks/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshEbooksStatus: () => fetch(`${BASE}/ebooks/refresh-all/status`).then(handle),
  setEbookCover: (id, imageUrl) =>
    fetch(`${BASE}/ebooks/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadEbookCover: (id, file) =>
    fetch(`${BASE}/ebooks/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchOpenLibrary: (q) => fetch(`${BASE}/search/openlibrary?q=${encodeURIComponent(q)}`).then(handle),
  lookupOpenLibraryUrl: (url) => fetch(`${BASE}/search/openlibrary-url?url=${encodeURIComponent(url)}`).then(handle),
  startEbookScan: () => fetch(`${BASE}/ebook-scan`, { method: 'POST' }).then(handle),
  ebookScanStatus: () => fetch(`${BASE}/ebook-scan/status`).then(handle),
  ebookScanPending: () => fetch(`${BASE}/ebook-scan/pending`).then(handle),
  resolveEbookPending: (id, payload) =>
    fetch(`${BASE}/ebook-scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreEbookPending: (id) => fetch(`${BASE}/ebook-scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipEbookPending: (ids) =>
    fetch(`${BASE}/ebook-scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreEbookPending: (ids) =>
    fetch(`${BASE}/ebook-scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredEbooks: () => fetch(`${BASE}/ebook-scan/ignored`).then(handle),
  unignoreEbook: (id) => fetch(`${BASE}/ebook-scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
  clearEbookLibrary: () => fetch(`${BASE}/ebooks/clear-all`, { method: 'POST' }).then(handle),

  listEbookAuthorImages: () => fetch(`${BASE}/ebooks/authors/images`).then(handle),
  searchEbookAuthorImages: (q, source) =>
    fetch(`${BASE}/ebooks/authors/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameEbookAuthors: (sourceNames, targetName) =>
    fetch(`${BASE}/ebooks/authors/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setEbookAuthorCover: (name, imageUrl) =>
    fetch(`${BASE}/ebooks/authors/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadEbookAuthorCover: (name, file) =>
    fetch(`${BASE}/ebooks/authors/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteEbookAuthorCover: (name) => fetch(`${BASE}/ebooks/authors/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listComics: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/comics?${qs}`).then(handle);
  },
  getComic: (id) => fetch(`${BASE}/comics/${id}`).then(handle),
  addComic: (payload) =>
    fetch(`${BASE}/comics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteComic: (id) => fetch(`${BASE}/comics/${id}`, { method: 'DELETE' }).then(handle),
  refreshComic: (id) => fetch(`${BASE}/comics/${id}/refresh`, { method: 'POST' }).then(handle),
  rematchComic: (id, payload) =>
    fetch(`${BASE}/comics/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  startBulkRefreshComics: () => fetch(`${BASE}/comics/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshComicsStatus: () => fetch(`${BASE}/comics/refresh-all/status`).then(handle),
  setComicCover: (id, imageUrl) =>
    fetch(`${BASE}/comics/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadComicCover: (id, file) =>
    fetch(`${BASE}/comics/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchComicVine: (q) => fetch(`${BASE}/search/comicvine?q=${encodeURIComponent(q)}`).then(handle),
  lookupComicVineUrl: (url) => fetch(`${BASE}/search/comicvine-url?url=${encodeURIComponent(url)}`).then(handle),
  searchMetron: (q) => fetch(`${BASE}/search/metron?q=${encodeURIComponent(q)}`).then(handle),
  searchGCD: (q) => fetch(`${BASE}/search/gcd?q=${encodeURIComponent(q)}`).then(handle),
  startComicScan: () => fetch(`${BASE}/comic-scan`, { method: 'POST' }).then(handle),
  comicScanStatus: () => fetch(`${BASE}/comic-scan/status`).then(handle),
  comicScanPending: () => fetch(`${BASE}/comic-scan/pending`).then(handle),
  resolveComicPending: (id, payload) =>
    fetch(`${BASE}/comic-scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreComicPending: (id) => fetch(`${BASE}/comic-scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipComicPending: (ids) =>
    fetch(`${BASE}/comic-scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreComicPending: (ids) =>
    fetch(`${BASE}/comic-scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredComics: () => fetch(`${BASE}/comic-scan/ignored`).then(handle),
  unignoreComic: (id) => fetch(`${BASE}/comic-scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
  clearComicLibrary: () => fetch(`${BASE}/comics/clear-all`, { method: 'POST' }).then(handle),

  listComicSeriesImages: () => fetch(`${BASE}/comics/series/images`).then(handle),
  searchComicSeriesImages: (q, source) =>
    fetch(`${BASE}/comics/series/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameComicSeries: (sourceNames, targetName) =>
    fetch(`${BASE}/comics/series/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setComicSeriesCover: (name, imageUrl) =>
    fetch(`${BASE}/comics/series/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadComicSeriesCover: (name, file) =>
    fetch(`${BASE}/comics/series/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteComicSeriesCover: (name) => fetch(`${BASE}/comics/series/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listAlbums: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/albums?${qs}`).then(handle);
  },
  getAlbum: (id) => fetch(`${BASE}/albums/${id}`).then(handle),
  addAlbum: (payload) =>
    fetch(`${BASE}/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  updateAlbum: (id, payload) =>
    fetch(`${BASE}/albums/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteAlbum: (id) => fetch(`${BASE}/albums/${id}`, { method: 'DELETE' }).then(handle),
  refreshAlbum: (id) => fetch(`${BASE}/albums/${id}/refresh`, { method: 'POST' }).then(handle),
  rematchAlbum: (id, payload) =>
    fetch(`${BASE}/albums/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  startBulkRefreshAlbums: () => fetch(`${BASE}/albums/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshAlbumsStatus: () => fetch(`${BASE}/albums/refresh-all/status`).then(handle),
  setAlbumCover: (id, imageUrl) =>
    fetch(`${BASE}/albums/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadAlbumCover: (id, file) =>
    fetch(`${BASE}/albums/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchMusicBrainz: (q) => fetch(`${BASE}/search/musicbrainz?q=${encodeURIComponent(q)}`).then(handle),
  lookupMusicBrainzUrl: (url) => fetch(`${BASE}/search/musicbrainz-url?url=${encodeURIComponent(url)}`).then(handle),
  searchLastfm: (q) => fetch(`${BASE}/search/lastfm?q=${encodeURIComponent(q)}`).then(handle),
  lookupLastfmUrl: (url) => fetch(`${BASE}/search/lastfm-url?url=${encodeURIComponent(url)}`).then(handle),
  startAlbumScan: () => fetch(`${BASE}/album-scan`, { method: 'POST' }).then(handle),
  albumScanStatus: () => fetch(`${BASE}/album-scan/status`).then(handle),
  albumScanPending: () => fetch(`${BASE}/album-scan/pending`).then(handle),
  resolveAlbumPending: (id, payload) =>
    fetch(`${BASE}/album-scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreAlbumPending: (id) => fetch(`${BASE}/album-scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipAlbumPending: (ids) =>
    fetch(`${BASE}/album-scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreAlbumPending: (ids) =>
    fetch(`${BASE}/album-scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredAlbums: () => fetch(`${BASE}/album-scan/ignored`).then(handle),
  unignoreAlbum: (id) => fetch(`${BASE}/album-scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
  clearAlbumLibrary: () => fetch(`${BASE}/albums/clear-all`, { method: 'POST' }).then(handle),

  listAlbumArtistImages: () => fetch(`${BASE}/albums/artists/images`).then(handle),
  searchAlbumArtistImages: (q, source) =>
    fetch(`${BASE}/albums/artists/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameAlbumArtists: (sourceNames, targetName) =>
    fetch(`${BASE}/albums/artists/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setAlbumArtistCover: (name, imageUrl) =>
    fetch(`${BASE}/albums/artists/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadAlbumArtistCover: (name, file) =>
    fetch(`${BASE}/albums/artists/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteAlbumArtistCover: (name) => fetch(`${BASE}/albums/artists/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listVinyl: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/vinyl?${qs}`).then(handle);
  },
  getVinylRecord: (id) => fetch(`${BASE}/vinyl/${id}`).then(handle),
  deleteVinylRecord: (id) => fetch(`${BASE}/vinyl/${id}`, { method: 'DELETE' }).then(handle),
  setVinylCover: (id, imageUrl) =>
    fetch(`${BASE}/vinyl/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadVinylCover: (id, file) =>
    fetch(`${BASE}/vinyl/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  startVinylSync: () => fetch(`${BASE}/vinyl/sync`, { method: 'POST' }).then(handle),
  vinylSyncStatus: () => fetch(`${BASE}/vinyl/sync/status`).then(handle),
  clearVinylLibrary: () => fetch(`${BASE}/vinyl/clear-all`, { method: 'POST' }).then(handle),

  listVinylArtistImages: () => fetch(`${BASE}/vinyl/artists/images`).then(handle),
  searchVinylArtistImages: (q, source) =>
    fetch(`${BASE}/vinyl/artists/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameVinylArtists: (sourceNames, targetName) =>
    fetch(`${BASE}/vinyl/artists/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setVinylArtistCover: (name, imageUrl) =>
    fetch(`${BASE}/vinyl/artists/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadVinylArtistCover: (name, file) =>
    fetch(`${BASE}/vinyl/artists/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteVinylArtistCover: (name) => fetch(`${BASE}/vinyl/artists/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listGames: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/games?${qs}`).then(handle);
  },
  getGame: (id) => fetch(`${BASE}/games/${id}`).then(handle),
  deleteGame: (id) => fetch(`${BASE}/games/${id}`, { method: 'DELETE' }).then(handle),
  setGameCover: (id, imageUrl) =>
    fetch(`${BASE}/games/${id}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadGameCover: (id, file) =>
    fetch(`${BASE}/games/${id}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  startGamesSync: () => fetch(`${BASE}/games/sync`, { method: 'POST' }).then(handle),
  gamesSyncStatus: () => fetch(`${BASE}/games/sync/status`).then(handle),
  clearGamesLibrary: () => fetch(`${BASE}/games/clear-all`, { method: 'POST' }).then(handle),

  listGamePlatformImages: () => fetch(`${BASE}/games/platforms/images`).then(handle),
  searchGamePlatformImages: (q, source) =>
    fetch(`${BASE}/games/platforms/search-images?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`).then(handle),
  renameGamePlatforms: (sourceNames, targetName) =>
    fetch(`${BASE}/games/platforms/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setGamePlatformCover: (name, imageUrl) =>
    fetch(`${BASE}/games/platforms/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadGamePlatformCover: (name, file) =>
    fetch(`${BASE}/games/platforms/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteGamePlatformCover: (name) => fetch(`${BASE}/games/platforms/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listGameStoreImages: () => fetch(`${BASE}/games/stores/images`).then(handle),
  searchGameStoreImages: (q) => fetch(`${BASE}/games/stores/search-images?q=${encodeURIComponent(q)}`).then(handle),
  renameGameStores: (sourceNames, targetName) =>
    fetch(`${BASE}/games/stores/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceNames, targetName }),
    }).then(handle),
  setGameStoreCover: (name, imageUrl) =>
    fetch(`${BASE}/games/stores/${encodeURIComponent(name)}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadGameStoreCover: (name, file) =>
    fetch(`${BASE}/games/stores/${encodeURIComponent(name)}/cover/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  deleteGameStoreCover: (name) => fetch(`${BASE}/games/stores/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }).then(handle),

  listTvShows: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    );
    return fetch(`${BASE}/tv?${qs}`).then(handle);
  },
  getTvShow: (id) => fetch(`${BASE}/tv/${id}`).then(handle),
  addTvShow: (payload) =>
    fetch(`${BASE}/tv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  updateTvShow: (id, payload) =>
    fetch(`${BASE}/tv/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteTvShow: (id) => fetch(`${BASE}/tv/${id}`, { method: 'DELETE' }).then(handle),
  refreshTvShow: (id) => fetch(`${BASE}/tv/${id}/refresh`, { method: 'POST' }).then(handle),
  rematchTvShow: (id, payload) =>
    fetch(`${BASE}/tv/${id}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  startBulkRefreshTv: () => fetch(`${BASE}/tv/refresh-all`, { method: 'POST' }).then(handle),
  bulkRefreshTvStatus: () => fetch(`${BASE}/tv/refresh-all/status`).then(handle),
  setTvShowPoster: (id, imageUrl) =>
    fetch(`${BASE}/tv/${id}/poster`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    }).then(handle),
  uploadTvShowPoster: (id, file) =>
    fetch(`${BASE}/tv/${id}/poster/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then(handle),
  searchTvdbPosters: (tvdbId) => fetch(`${BASE}/images/tvdb-posters/${tvdbId}`).then(handle),
  searchTvdb: (q, year) =>
    fetch(`${BASE}/search/tvdb?q=${encodeURIComponent(q)}${year ? `&year=${encodeURIComponent(year)}` : ''}`).then(handle),
  lookupTvdbUrl: (url) => fetch(`${BASE}/search/tvdb-url?url=${encodeURIComponent(url)}`).then(handle),
  startTvScan: () => fetch(`${BASE}/tv-scan`, { method: 'POST' }).then(handle),
  tvScanStatus: () => fetch(`${BASE}/tv-scan/status`).then(handle),
  tvScanPending: () => fetch(`${BASE}/tv-scan/pending`).then(handle),
  resolveTvPending: (id, payload) =>
    fetch(`${BASE}/tv-scan/pending/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  ignoreTvPending: (id) => fetch(`${BASE}/tv-scan/pending/${id}/ignore`, { method: 'POST' }).then(handle),
  batchSkipTvPending: (ids) =>
    fetch(`${BASE}/tv-scan/pending/batch-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  batchIgnoreTvPending: (ids) =>
    fetch(`${BASE}/tv-scan/pending/batch-ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then(handle),
  listIgnoredTvShows: () => fetch(`${BASE}/tv-scan/ignored`).then(handle),
  unignoreTvShow: (id) => fetch(`${BASE}/tv-scan/ignored/${id}`, { method: 'DELETE' }).then(handle),
  clearTvLibrary: () => fetch(`${BASE}/tv/clear-all`, { method: 'POST' }).then(handle),

  listNotifications: () => fetch(`${BASE}/notifications`).then(handle),
  clearNotification: (id) => fetch(`${BASE}/notifications/${id}`, { method: 'DELETE' }).then(handle),
  clearAllNotifications: () => fetch(`${BASE}/notifications`, { method: 'DELETE' }).then(handle),

  listBackups: () => fetch(`${BASE}/backups`).then(handle),
  backupStatus: () => fetch(`${BASE}/backups/status`).then(handle),
  startBackup: () => fetch(`${BASE}/backups`, { method: 'POST' }).then(handle),
  backupDownloadUrl: (filename) => `${BASE}/backups/${encodeURIComponent(filename)}/download`,
  deleteBackup: (filename) => fetch(`${BASE}/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' }).then(handle),
  restoreBackup: (filename) => fetch(`${BASE}/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' }).then(handle),

  listTextExports: () => fetch(`${BASE}/exports/text`).then(handle),
  textExportStatus: () => fetch(`${BASE}/exports/text/status`).then(handle),
  startTextExport: () => fetch(`${BASE}/exports/text`, { method: 'POST' }).then(handle),
  textExportDownloadUrl: (filename) => `${BASE}/exports/text/${encodeURIComponent(filename)}/download`,
  deleteTextExport: (filename) => fetch(`${BASE}/exports/text/${encodeURIComponent(filename)}`, { method: 'DELETE' }).then(handle),

  listHtmlExports: () => fetch(`${BASE}/exports/html`).then(handle),
  htmlExportStatus: () => fetch(`${BASE}/exports/html/status`).then(handle),
  startHtmlExport: () => fetch(`${BASE}/exports/html`, { method: 'POST' }).then(handle),
  htmlExportDownloadUrl: (name) => `${BASE}/exports/html/${encodeURIComponent(name)}/download`,
  deleteHtmlExport: (name) => fetch(`${BASE}/exports/html/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(handle),
};
