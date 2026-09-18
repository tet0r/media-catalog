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

  useEffect(() => {
    api.getHealth().then((h) => setVersion(h.version)).catch(() => {});
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          🎬 Movie Cataloger
          {version && <span className="version-tag">v{version}</span>}
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
