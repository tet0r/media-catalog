import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { api } from './api.js';
import Library from './pages/Library.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import AddMovie from './pages/AddMovie.jsx';
import ScanLibrary from './pages/ScanLibrary.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [version, setVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    api.getHealth().then((h) => setVersion(h.version)).catch(() => {});
    api.getVersionCheck().then(setUpdateInfo).catch(() => {});
  }, []);

  return (
    <div className="app">
      <header className="topbar">
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
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/movies/:id" element={<MovieDetail />} />
          <Route path="/add" element={<AddMovie />} />
          <Route path="/scan" element={<ScanLibrary />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
