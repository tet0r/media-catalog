import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Library from './pages/Library.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import AddMovie from './pages/AddMovie.jsx';
import ScanLibrary from './pages/ScanLibrary.jsx';
import Settings from './pages/Settings.jsx';
import SortMenu from './components/SortMenu.jsx';

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];

export default function App() {
  const [version, setVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const location = useLocation();
  const onLibraryPage = location.pathname === '/';

  // Lifted up from the Library page itself: App never unmounts while
  // navigating between routes, so keeping this state here means it just
  // survives a trip to a movie's detail page and back for free, no
  // module-level persistence hack needed (unlike scroll position, which is
  // a DOM concern Library still has to track on its own).
  const [q, setQ] = useState('');
  const [rating, setRating] = useState('');
  const [sort, setSort] = useState('title');
  const [dir, setDir] = useState('asc');

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
            🎬 Movie Cataloger
            {version && <span className="version-tag">v{version}</span>}
            {updateInfo?.updateAvailable && (
              <a
                className="update-badge"
                href="https://github.com/tet0r/movie-cataloger/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                title={`A new version (v${updateInfo.latest}) is available on GitHub`}
              >
                Update available
              </a>
            )}
          </div>
          <nav>
            <NavLink to="/" end>Library</NavLink>
            <NavLink to="/add">Add Movie</NavLink>
            <NavLink to="/scan">Scan Library</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </div>
        {onLibraryPage && (
          <div className="toolbar">
            <input placeholder="Search your collection..." value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">View: All</option>
              {RATINGS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <SortMenu sort={sort} dir={dir} onChange={(s, d) => { setSort(s); setDir(d); }} />
          </div>
        )}
      </header>
      <main className="content">
        <Routes>
          <Route
            path="/"
            element={
              <Library
                q={q}
                rating={rating}
                sort={sort}
                dir={dir}
                onSortChange={(s, d) => { setSort(s); setDir(d); }}
              />
            }
          />
          <Route path="/movies/:id" element={<MovieDetail />} />
          <Route path="/add" element={<AddMovie />} />
          <Route path="/scan" element={<ScanLibrary />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
