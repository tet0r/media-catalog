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
import EbookLibrary from './pages/EbookLibrary.jsx';
import EbookDetail from './pages/EbookDetail.jsx';
import AddEbook from './pages/AddEbook.jsx';
import ScanEbooks from './pages/ScanEbooks.jsx';
import AlbumLibrary from './pages/AlbumLibrary.jsx';
import AlbumDetail from './pages/AlbumDetail.jsx';
import AddAlbum from './pages/AddAlbum.jsx';
import ScanAlbums from './pages/ScanAlbums.jsx';
import VinylLibrary from './pages/VinylLibrary.jsx';
import VinylDetail from './pages/VinylDetail.jsx';
import GamesLibrary from './pages/GamesLibrary.jsx';
import GameDetail from './pages/GameDetail.jsx';
import Settings from './pages/Settings.jsx';
import SortMenu from './components/SortMenu.jsx';

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];

// Alphabetical, per how the sidebar is meant to order media-type tabs — a
// future media type just slots in here and the sidebar/order follow.
// "Music" is the one section with sub-sections (Albums, Vinyl) rather than
// a single library, since those two are fundamentally different: Albums
// scans local files and matches them against MusicBrainz, while Vinyl
// pulls an existing collection from Discogs — no local files involved at
// all — so they need to stay visually and navigationally distinct rather
// than being forced into one shared library view.
const SECTIONS = [
  {
    key: 'music',
    label: 'Music',
    icon: '💿',
    children: [
      { key: 'albums', label: 'Albums', path: '/music/albums' },
      { key: 'vinyl', label: 'Vinyl', path: '/music/vinyl' },
    ],
  },
  { key: 'audiobooks', label: 'Audiobooks', path: '/audiobooks', icon: '🎧' },
  { key: 'ebooks', label: 'Ebooks', path: '/ebooks', icon: '📚' },
  { key: 'games', label: 'Games', path: '/games', icon: '🎮' },
  { key: 'movies', label: 'Movies', path: '/movies', icon: '🎬' },
];

// Flattened view of SECTIONS for path-matching — activeSection needs to
// find a match whether the section is a flat entry or one of a group's
// children, without the rest of the app needing to know which shape it is.
const FLAT_SECTIONS = SECTIONS.flatMap((s) => s.children || [{ key: s.key, path: s.path }]);

export default function App() {
  const [version, setVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const location = useLocation();

  const activeSection = FLAT_SECTIONS.find((s) => location.pathname.startsWith(s.path));
  const onMoviesLibrary = location.pathname === '/movies';
  const onAudiobooksLibrary = location.pathname === '/audiobooks';
  const onEbooksLibrary = location.pathname === '/ebooks';
  const onAlbumsLibrary = location.pathname === '/music/albums';
  const onVinylLibrary = location.pathname === '/music/vinyl';
  const onGamesLibrary = location.pathname === '/games';

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

  const [ebookQ, setEbookQ] = useState('');
  const [ebookSort, setEbookSort] = useState('title');
  const [ebookDir, setEbookDir] = useState('asc');
  const [ebookGroupByAuthor, setEbookGroupByAuthor] = useState(false);

  const [albumQ, setAlbumQ] = useState('');
  const [albumSort, setAlbumSort] = useState('title');
  const [albumDir, setAlbumDir] = useState('asc');
  const [albumGroupByArtist, setAlbumGroupByArtist] = useState(false);

  const [vinylQ, setVinylQ] = useState('');
  const [vinylSort, setVinylSort] = useState('title');
  const [vinylDir, setVinylDir] = useState('asc');
  const [vinylGroupByArtist, setVinylGroupByArtist] = useState(false);

  const [gamesQ, setGamesQ] = useState('');
  const [gamesSort, setGamesSort] = useState('title');
  const [gamesDir, setGamesDir] = useState('asc');
  const [gamesGroupByPlatform, setGamesGroupByPlatform] = useState(false);

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
            {activeSection?.key === 'ebooks' && (
              <>
                <NavLink to="/ebooks" end>Library</NavLink>
                <NavLink to="/ebooks/add">Add Ebook</NavLink>
                <NavLink to="/ebooks/scan">Scan Library</NavLink>
              </>
            )}
            {activeSection?.key === 'albums' && (
              <>
                <NavLink to="/music/albums" end>Library</NavLink>
                <NavLink to="/music/albums/add">Add Album</NavLink>
                <NavLink to="/music/albums/scan">Scan Library</NavLink>
              </>
            )}
            {activeSection?.key === 'vinyl' && (
              <NavLink to="/music/vinyl" end>Library</NavLink>
            )}
            {activeSection?.key === 'games' && (
              <NavLink to="/games" end>Library</NavLink>
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
        {onEbooksLibrary && (
          <div className="toolbar">
            <input placeholder="Search title or author..." value={ebookQ} onChange={(e) => setEbookQ(e.target.value)} />
            <button
              type="button"
              className={`toolbar-toggle${ebookGroupByAuthor ? ' active' : ''}`}
              onClick={() => setEbookGroupByAuthor((g) => !g)}
            >
              Group by Author
            </button>
            <SortMenu
              sort={ebookSort}
              dir={ebookDir}
              onChange={(s, d) => { setEbookSort(s); setEbookDir(d); }}
              options={EBOOK_SORT_OPTIONS}
            />
          </div>
        )}
        {onAlbumsLibrary && (
          <div className="toolbar">
            <input placeholder="Search title or artist..." value={albumQ} onChange={(e) => setAlbumQ(e.target.value)} />
            <button
              type="button"
              className={`toolbar-toggle${albumGroupByArtist ? ' active' : ''}`}
              onClick={() => setAlbumGroupByArtist((g) => !g)}
            >
              Group by Artist
            </button>
            <SortMenu
              sort={albumSort}
              dir={albumDir}
              onChange={(s, d) => { setAlbumSort(s); setAlbumDir(d); }}
              options={ALBUM_SORT_OPTIONS}
            />
          </div>
        )}
        {onVinylLibrary && (
          <div className="toolbar">
            <input placeholder="Search title or artist..." value={vinylQ} onChange={(e) => setVinylQ(e.target.value)} />
            <button
              type="button"
              className={`toolbar-toggle${vinylGroupByArtist ? ' active' : ''}`}
              onClick={() => setVinylGroupByArtist((g) => !g)}
            >
              Group by Artist
            </button>
            <SortMenu
              sort={vinylSort}
              dir={vinylDir}
              onChange={(s, d) => { setVinylSort(s); setVinylDir(d); }}
              options={ALBUM_SORT_OPTIONS}
            />
          </div>
        )}
        {onGamesLibrary && (
          <div className="toolbar">
            <input placeholder="Search title or platform..." value={gamesQ} onChange={(e) => setGamesQ(e.target.value)} />
            <button
              type="button"
              className={`toolbar-toggle${gamesGroupByPlatform ? ' active' : ''}`}
              onClick={() => setGamesGroupByPlatform((g) => !g)}
            >
              Group by Platform
            </button>
            <SortMenu
              sort={gamesSort}
              dir={gamesDir}
              onChange={(s, d) => { setGamesSort(s); setGamesDir(d); }}
              options={GAME_SORT_OPTIONS}
            />
          </div>
        )}
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label="Media type">
          {SECTIONS.map((s) =>
            s.children ? (
              <div key={s.key} className="sidebar-group">
                <div className="sidebar-group-label">
                  <span className="sidebar-icon">{s.icon}</span>
                  {s.label}
                </div>
                {s.children.map((c) => (
                  <NavLink
                    key={c.key}
                    to={c.path}
                    className={({ isActive }) => `sidebar-link sidebar-sublink${isActive ? ' active' : ''}`}
                  >
                    {c.label}
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink key={s.key} to={s.path} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                <span className="sidebar-icon">{s.icon}</span>
                {s.label}
              </NavLink>
            )
          )}
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

            <Route
              path="/ebooks"
              element={
                <EbookLibrary
                  q={ebookQ}
                  sort={ebookSort}
                  dir={ebookDir}
                  onSortChange={(s, d) => { setEbookSort(s); setEbookDir(d); }}
                  groupByAuthor={ebookGroupByAuthor}
                />
              }
            />
            <Route path="/ebooks/:id" element={<EbookDetail />} />
            <Route path="/ebooks/add" element={<AddEbook />} />
            <Route path="/ebooks/scan" element={<ScanEbooks />} />

            <Route path="/music" element={<Navigate to="/music/albums" replace />} />
            <Route
              path="/music/albums"
              element={
                <AlbumLibrary
                  q={albumQ}
                  sort={albumSort}
                  dir={albumDir}
                  onSortChange={(s, d) => { setAlbumSort(s); setAlbumDir(d); }}
                  groupByArtist={albumGroupByArtist}
                />
              }
            />
            <Route path="/music/albums/:id" element={<AlbumDetail />} />
            <Route path="/music/albums/add" element={<AddAlbum />} />
            <Route path="/music/albums/scan" element={<ScanAlbums />} />

            <Route
              path="/music/vinyl"
              element={
                <VinylLibrary
                  q={vinylQ}
                  sort={vinylSort}
                  dir={vinylDir}
                  onSortChange={(s, d) => { setVinylSort(s); setVinylDir(d); }}
                  groupByArtist={vinylGroupByArtist}
                />
              }
            />
            <Route path="/music/vinyl/:id" element={<VinylDetail />} />

            <Route
              path="/games"
              element={
                <GamesLibrary
                  q={gamesQ}
                  sort={gamesSort}
                  dir={gamesDir}
                  onSortChange={(s, d) => { setGamesSort(s); setGamesDir(d); }}
                  groupByPlatform={gamesGroupByPlatform}
                />
              }
            />
            <Route path="/games/:id" element={<GameDetail />} />

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

const EBOOK_SORT_OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'year', label: 'Year' },
  { key: 'page_count', label: 'Length' },
];

const ALBUM_SORT_OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'artist', label: 'Artist' },
  { key: 'year', label: 'Year' },
];

const GAME_SORT_OPTIONS = [
  { key: 'title', label: 'A-Z' },
  { key: 'platform', label: 'Platform' },
  { key: 'release_date', label: 'Release Date' },
];
