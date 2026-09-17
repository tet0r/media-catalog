import { Routes, Route, NavLink } from 'react-router-dom';
import Library from './pages/Library.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import AddMovie from './pages/AddMovie.jsx';
import ScanLibrary from './pages/ScanLibrary.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🎬 Movie Cataloger</div>
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
