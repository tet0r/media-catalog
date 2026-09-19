import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Library from './pages/Library.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import AddMovie from './pages/AddMovie.jsx';
import ScanLibrary from './pages/ScanLibrary.jsx';
import AudiobookLibrary from './pages/AudiobookLibrary.jsx';
import AudiobookDetail from './pages/AudiobookDetail.jsx';
import AddAudiobook from './pages/AddAudiobook.jsx';
import ScanAudiobooks from './pages/ScanAudiobooks.jsx';
import Settings from './pages/Settings.jsx';
import SortMenu from './components/SortMenu.jsx';

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];

// Alphabetical, per how the sidebar is meant to order media-type tabs — a
// future media type just slots in here and the sidebar/order follow.
const SECTIONS = [
  { key: 'audiobooks', label: 'Audiobooks', path: '/audiobooks', icon: '🎧' },
  { key: 'movies', label: 'Movies', path: '/movies', icon: '🎬' },
];

export default function App() {
  const [version, setVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const location = useLocation();

  const activeSection = SECTIONS.find((s) => location.pathname.startsWith(s.path));
  const onMoviesLibrary = location.pathname === '/movies';
  const onAudiobooksLibrary = location.pathname === '/audiobooks';

  // Lifted up from the library pages themselves: App never unmounts while
  // navigating between routes, so keeping this state here means it just
  // survives a trip to a detail page and back for free, no module-level
  // persistence hack needed (unlike scroll position, which is a DOM
  // concern each library page still tracks on its own). Movies and
  // audiobooks each get their own independent copy.
  const [movieQ, setMovieQ] = useState('');
  const [movieRating, setMovieRating] = useState('');
  const [movieSort, setMovieSort] = useState('title');
  const [movieDir, setMovieDir] = useState('asc');

  const [bookQ, setBookQ] = useState('');
  const [bookSort, setBookSort] = useState('title');
  const [bookDir, setBookDir] = useState('asc');
  const [bookGroupByAuthor, setBookGroupByAuthor] = useState(false);

  useEffect(() => {
    api.getHealth().then((h) => setVersion(h.version)).catch(() => {});

    const checkForUpdate = () => api.getVersionCheck().then(setUpdateInfo).catch(() => {});
    checkForUpdate();
    // Re-check periodically — a tab left open otherwise never learns about
    // a push that happened after it was loaded.
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            🎬 Media Catalog
            {version && <span className="version-tag">v{version}</span>}
            {updateInfo?.updateAvailable && (
              <a
                className="update-badge"
                href="https://github.com/tet0r/media-catalog/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                title={`A new version (v${updateInfo.latest}) is available on GitHub`}
              >
                Update available
              </a>
            )}
          </div>
          <nav>
            {activeSection?.key === 'movies' && (
              <>
                <NavLink to="/movies" end>Library</NavLink>
                <NavLink to="/movies/add">Add Movie</NavLink>
                <NavLink to="/movies/scan">Scan Library</NavLink>
              </>
            )}
            {activeSection?.key === 'audiobooks' && (
              <>
                <NavLink to="/audiobooks" end>Library</NavLink>
                <NavLink to="/audiobooks/add">Add Audiobook</NavLink>
                <NavLink to="/audiobooks/scan">Scan Library</NavLink>
              </>
            )}
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </div>
        {onMoviesLibrary && (
          <div className="toolbar">
            <input placeholder="Search your collection..." value={movieQ} onChange={(e) => setMovieQ(e.target.value)} />
            <select value={movieRating} onChange={(e) => setMovieRating(e.target.value)}>
              <option value="">View: All</option>
              {RATINGS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <SortMenu sort={movieSort} dir={movieDir} onChange={(s, d) => { setMovieSort(s); setMovieDir(d); }} />
          </div>
        )}
        {onAudiobooksLibrary && (
          <div className="toolbar">
            <input placeholder="Search title or author..." value={bookQ} onChange={(e) => setBookQ(e.target.value)} />
            <button
              type="button"
              className={`toolbar-toggle${bookGroupByAuthor ? ' active' : ''}`}
              onClick={() => setBookGroupByAuthor((g) => !g)}
            >
              Group by Author
            </button>
            <SortMenu
              sort={bookSort}
              dir={bookDir}
              onChange={(s, d) => { setBookSort(s); setBookDir(d); }}
              options={AUDIOBOOK_SORT_OPTIONS}
            />
          </div>
        )}
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label="Media type">
          {SECTIONS.map((s) => (
            <NavLink key={s.key} to={s.path} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              <span className="sidebar-icon">{s.icon}</span>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/movies" replace />} />

            <Route
              path="/movies"
              element={
                <Library
                  q={movieQ}
                  rating={movieRating}
                  sort={movieSort}
                  dir={movieDir}
                  onSortChange={(s, d) => { setMovieSort(s); setMovieDir(d); }}
                />
              }
            />
            <Route path="/movies/:id" element={<MovieDetail />} />
            <Route path="/movies/add" element={<AddMovie />} />
            <Route path="/movies/scan" element={<ScanLibrary />} />

            <Route
              path="/audiobooks"
              element={
                <AudiobookLibrary
                  q={bookQ}
                  sort={bookSort}
                  dir={bookDir}
                  onSortChange={(s, d) => { setBookSort(s); setBookDir(d); }}
                  groupByAuthor={bookGroupByAuthor}
                />
              }
            />
            <Route path="/audiobooks/:id" element={<AudiobookDetail />} />
            <Route path="/audiobooks/add" element={<AddAudiobook />} />
            <Route path="/audiobooks/scan" element={<ScanAudiobooks />} />

            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

const AUDIOBOOK_SORT_OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'year', label: 'Year' },
  { key: 'runtime_minutes', label: 'Length' },
  { key: 'rating', label: 'Rating' },
];
