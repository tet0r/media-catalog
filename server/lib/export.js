const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const db = require('../db');
const { BACKUP_DIR } = require('./backup');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const POSTERS_DIR = path.join(DATA_DIR, 'posters');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Lives alongside backups (same BACKUP_DIR) rather than under DATA_DIR,
// per the same reasoning as lib/backup.js — a Docker/Portainer stack
// recreation can abandon DATA_DIR for a fresh empty one, and an export the
// user deliberately generated shouldn't quietly vanish with it.
const EXPORT_ROOT = path.join(BACKUP_DIR, 'exports');
const TEXT_EXPORT_DIR = path.join(EXPORT_ROOT, 'text');
const HTML_EXPORT_DIR = path.join(EXPORT_ROOT, 'html');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function setStatus(type, fields) {
  const cur = db.prepare('SELECT * FROM export_status WHERE type = ?').get(type);
  const merged = { ...cur, ...fields, type };
  db.prepare(
    'UPDATE export_status SET running=@running, last_run=@last_run, started_at=@started_at, message=@message WHERE type=@type'
  ).run(merged);
}

// Yielded periodically during a big per-item loop (HTML export writes one
// file per library item) so a large library doesn't block the event loop —
// and every other request this server is handling — for the whole
// duration of the export.
function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Same path-traversal guard as lib/backup.js's safeBackupPath, generalized
// to either export kind's own root directory.
function safeExportPath(root, name) {
  const base = path.basename(String(name || ''));
  const resolvedRoot = path.resolve(root);
  const full = path.join(resolvedRoot, base);
  if (!base || path.dirname(full) !== resolvedRoot) {
    throw new Error('Invalid export name');
  }
  return full;
}

function safeTextExportPath(filename) {
  return safeExportPath(TEXT_EXPORT_DIR, filename);
}

function safeHtmlExportPath(name) {
  return safeExportPath(HTML_EXPORT_DIR, name);
}

// ---------------------------------------------------------------------
// Text export — one file, one section per media type, alphabetical by
// title within each section.
// ---------------------------------------------------------------------

function listTextExports() {
  fs.mkdirSync(TEXT_EXPORT_DIR, { recursive: true });
  return fs
    .readdirSync(TEXT_EXPORT_DIR)
    .filter((f) => f.startsWith('library-export-') && f.endsWith('.txt'))
    .map((f) => {
      const stat = fs.statSync(path.join(TEXT_EXPORT_DIR, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function deleteTextExport(filename) {
  fs.unlinkSync(safeTextExportPath(filename));
}

function namesOf(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean).join(', ') : '';
  } catch {
    return '';
  }
}

// Games' release_date is a free-form date string (LaunchBox's own format,
// not guaranteed to be just a year) — every other type already has a
// plain year column, this is the one exception.
function yearFromDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})/);
  return m ? m[1] : null;
}

function withSecondaryAndYear(title, secondary, year) {
  let line = title;
  if (secondary) line += ` — ${secondary}`;
  if (year) line += ` (${year})`;
  return line;
}

function buildTextExportContent() {
  const lines = [];
  lines.push('MEDIA CATALOG — LIBRARY EXPORT');
  lines.push(`Generated ${new Date().toLocaleString()}`);
  lines.push('');

  function section(heading, rows, formatLine) {
    const rule = '='.repeat(Math.max(40, heading.length));
    lines.push(rule);
    lines.push(`${heading.toUpperCase()} (${rows.length})`);
    lines.push(rule);
    if (rows.length === 0) {
      lines.push('(none)');
    } else {
      for (const row of rows) lines.push(formatLine(row));
    }
    lines.push('');
  }

  section(
    'Movies',
    db.prepare('SELECT title, year, director FROM movies ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, r.director, r.year)
  );

  section(
    'TV Shows',
    db.prepare('SELECT title, year, network FROM tv_shows ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, r.network, r.year)
  );

  section(
    'Audiobooks',
    db.prepare('SELECT title, year, authors FROM audiobooks ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, namesOf(r.authors), r.year)
  );

  section(
    'Comics',
    db.prepare('SELECT title, year, series, issue_number FROM comics ORDER BY title COLLATE NOCASE').all(),
    (r) => {
      const label = r.series ? `${r.series}${r.issue_number ? ` #${r.issue_number}` : ''} — ${r.title}` : r.title;
      return r.year ? `${label} (${r.year})` : label;
    }
  );

  section(
    'Ebooks',
    db.prepare('SELECT title, year, authors FROM ebooks ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, namesOf(r.authors), r.year)
  );

  section(
    'Digital',
    db.prepare('SELECT title, year, artist FROM albums ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, r.artist, r.year)
  );

  section(
    'Vinyl',
    db.prepare('SELECT title, year, artist FROM vinyl_records ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, r.artist, r.year)
  );

  section(
    'Games',
    db.prepare('SELECT title, release_date, platform FROM games ORDER BY title COLLATE NOCASE').all(),
    (r) => withSecondaryAndYear(r.title, r.platform, yearFromDate(r.release_date))
  );

  return lines.join('\n');
}

async function runTextExport() {
  const status = db.prepare("SELECT running FROM export_status WHERE type = 'text'").get();
  if (status.running) return;
  const startedAt = Date.now();
  setStatus('text', { running: 1, started_at: new Date().toISOString(), message: 'Exporting...' });
  try {
    fs.mkdirSync(TEXT_EXPORT_DIR, { recursive: true });
    const content = buildTextExportContent();
    const filename = `library-export-${stamp()}.txt`;
    fs.writeFileSync(path.join(TEXT_EXPORT_DIR, filename), content, 'utf-8');
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    setStatus('text', {
      running: 0,
      last_run: new Date().toISOString(),
      message: `Export complete — ${filename} in ${seconds}s.`,
    });
  } catch (err) {
    setStatus('text', { running: 0, message: `Export failed: ${err.message}` });
  }
}

// ---------------------------------------------------------------------
// HTML export — a static, read-only clone of the browsing experience
// (library grids + detail pages), reusing the app's own built CSS for
// visual parity. No Settings/Add/Scan pages, no live API calls — every
// page here is plain HTML with all its data baked in.
// ---------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function parseJsonArray(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// The Vite build's CSS is served with a content hash in its filename (e.g.
// index-Cz7pesxg.css), which changes every build — so this is located by
// directory listing rather than a fixed path. Requires the client to have
// actually been built (npm run build / the Docker image) first; there's
// nothing sensible to fall back to for a feature whose whole point is
// visually matching that build's own CSS.
function findBuiltCss() {
  const assetsDir = path.join(PUBLIC_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const file = fs.readdirSync(assetsDir).find((f) => f.endsWith('.css'));
  return file ? path.join(assetsDir, file) : null;
}

const SIDEBAR_LINKS = [
  { key: 'audiobooks', label: 'Audiobooks', icon: '🎧' },
  { key: 'comics', label: 'Comics', icon: '💥' },
  { key: 'ebooks', label: 'Ebooks', icon: '📚' },
  { key: 'games', label: 'Games', icon: '🎮' },
  { key: 'movies', label: 'Movies', icon: '🎬' },
  { key: 'albums', label: 'Digital', icon: '💿' },
  { key: 'vinyl', label: 'Vinyl', icon: '💿' },
  { key: 'tv', label: 'TV Shows', icon: '📺' },
];

// Every generated page (grid or detail) lives exactly one folder below the
// export root (e.g. movies/index.html, movies/42.html) — a uniform depth
// means every page's relative links use the same "../" prefix, with no
// special-casing for any one media type.
function pageShell({ title, activeKey, bodyHtml }) {
  const links = SIDEBAR_LINKS.map(
    (s) =>
      `<a class="sidebar-link${s.key === activeKey ? ' active' : ''}" href="../${s.key}/index.html"><span class="sidebar-icon">${s.icon}</span>${s.label}</a>`
  ).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="../assets/style.css" />
<style>.sidebar-overlay-export{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:35;}</style>
<title>${escapeHtml(title)}</title>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="topbar-row">
      <button type="button" class="sidebar-toggle" aria-label="Toggle navigation menu">☰</button>
      <div class="brand">🎬 Media Catalog <span class="version-tag">Library Export</span></div>
    </div>
  </header>
  <div class="app-body">
    <div class="sidebar-overlay-export"></div>
    <nav class="sidebar" aria-label="Media type">
      ${links}
    </nav>
    <main class="content">
${bodyHtml}
    </main>
  </div>
</div>
<script>
(function () {
  var btn = document.querySelector('.sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay-export');
  function close() { sidebar.classList.remove('sidebar-open'); overlay.style.display = 'none'; }
  function open() { sidebar.classList.add('sidebar-open'); overlay.style.display = 'block'; }
  if (btn) btn.addEventListener('click', function () {
    sidebar.classList.contains('sidebar-open') ? close() : open();
  });
  if (overlay) overlay.addEventListener('click', close);
})();
</script>
</body>
</html>
`;
}

function posterBlock(coverFile, title, referencedPosters) {
  if (coverFile) {
    referencedPosters.add(coverFile);
    return `<div class="poster"><img src="../posters/${encodeURIComponent(coverFile)}" alt="" /></div>`;
  }
  return `<div class="poster"><div class="no-poster">${escapeHtml(title)}</div></div>`;
}

function gridPage({ typeKey, heading, countLabel, items, cardHtml }) {
  const cards = items.map(cardHtml).join('\n');
  const body = `
      <h1>${escapeHtml(heading)}</h1>
      <p class="muted">${items.length} ${countLabel}${items.length === 1 ? '' : 's'}</p>
      <div class="grid">
${cards}
      </div>`;
  return pageShell({ title: `${heading} — Media Catalog`, activeKey: typeKey, bodyHtml: body });
}

function tagList(values) {
  if (!values || values.length === 0) return '';
  return `<div class="tags">${values.map((v) => `<span class="tag">${escapeHtml(v)}</span>`).join('')}</div>`;
}

async function runHtmlExport() {
  const status = db.prepare("SELECT running FROM export_status WHERE type = 'html'").get();
  if (status.running) return;
  const startedAt = Date.now();
  setStatus('html', { running: 1, started_at: new Date().toISOString(), message: 'Exporting...' });
  try {
    const css = findBuiltCss();
    if (!css) {
      throw new Error('Client build not found (public/assets) — build the client before exporting to HTML');
    }

    const folderName = `library-export-${stamp()}`;
    const root = path.join(HTML_EXPORT_DIR, folderName);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(root, 'posters'), { recursive: true });
    fs.copyFileSync(css, path.join(root, 'assets', 'style.css'));

    const referencedPosters = new Set();
    const counts = {};

    // Landing page: a plain redirect to Movies (the same section the live
    // app's own "/" route lands on) rather than duplicating its grid — one
    // generation path per media type, no special-casing for whichever one
    // happens to be "first".
    fs.writeFileSync(
      path.join(root, 'index.html'),
      `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="refresh" content="0; url=movies/index.html" />
<title>Media Catalog — Library Export</title>
</head>
<body style="background:#14161a;color:#e8e8ea;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<p>Redirecting to <a href="movies/index.html" style="color:#e2b33c;">Movies</a>...</p>
</body>
</html>
`
    );

    await exportMovies(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportTvShows(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportAudiobooks(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportComics(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportEbooks(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportAlbums(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportVinyl(root, referencedPosters, counts);
    await yieldEventLoop();
    await exportGames(root, referencedPosters, counts);

    for (const file of referencedPosters) {
      const src = path.join(POSTERS_DIR, file);
      try {
        fs.copyFileSync(src, path.join(root, 'posters', file));
      } catch {
        // Cover file referenced in the DB but missing on disk — skip it
        // rather than fail the whole export; the page just shows its
        // fallback "no poster" block instead (same <img> 404 behavior the
        // live app already tolerates).
      }
    }

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
    fs.writeFileSync(
      path.join(root, '.manifest.json'),
      JSON.stringify({ generated_at: new Date().toISOString(), counts, total_items: totalItems }, null, 2)
    );

    setStatus('html', {
      running: 0,
      last_run: new Date().toISOString(),
      message: `Export complete — ${folderName} (${totalItems} items) in ${seconds}s.`,
    });
  } catch (err) {
    setStatus('html', { running: 0, message: `Export failed: ${err.message}` });
  }
}

// ---- Movies ----
async function exportMovies(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM movies ORDER BY title COLLATE NOCASE').all();
  counts.movies = rows.length;
  const dir = path.join(root, 'movies');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.poster_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml([r.year, r.director].filter(Boolean).join(' — '))}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'movies', heading: 'Movies', countLabel: 'movie', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const genres = parseJsonArray(r.genres);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.poster_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${r.director ? `<p class="director">Directed by ${escapeHtml(r.director)}</p>` : ''}
          ${r.tagline ? `<p class="tagline">${escapeHtml(r.tagline)}</p>` : ''}
          ${tagList(genres)}
          <div class="stats">
            ${r.runtime ? `<span>${formatDuration(r.runtime)}</span>` : ''}
            ${r.personal_rating ? `<span>★ ${r.personal_rating}/10</span>` : ''}
            ${r.tmdb_rating ? `<span>TMDB ${r.tmdb_rating}</span>` : ''}
          </div>
          ${r.overview ? `<p class="overview">${escapeHtml(r.overview)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'movies', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- TV Shows ----
async function exportTvShows(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM tv_shows ORDER BY title COLLATE NOCASE').all();
  counts.tv = rows.length;
  const dir = path.join(root, 'tv');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.poster_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml([r.year, r.network].filter(Boolean).join(' — '))}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'tv', heading: 'TV Shows', countLabel: 'show', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const genres = parseJsonArray(r.genres);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.poster_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${r.network ? `<p class="director">${escapeHtml(r.network)}</p>` : ''}
          ${tagList(genres)}
          <div class="stats">
            ${r.status ? `<span>${escapeHtml(r.status)}</span>` : ''}
            ${r.personal_rating ? `<span>★ ${r.personal_rating}/10</span>` : ''}
            ${r.tvdb_score ? `<span>TVDB ${r.tvdb_score}</span>` : ''}
          </div>
          ${r.overview ? `<p class="overview">${escapeHtml(r.overview)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'tv', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Audiobooks ----
async function exportAudiobooks(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM audiobooks ORDER BY title COLLATE NOCASE').all();
  counts.audiobooks = rows.length;
  const dir = path.join(root, 'audiobooks');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => {
    const authors = namesOf(r.authors);
    return `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(authors)}</div>
        </a>`;
  };
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'audiobooks', heading: 'Audiobooks', countLabel: 'audiobook', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const authors = namesOf(r.authors);
    const narrators = namesOf(r.narrators);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${authors ? `<p class="director">by ${escapeHtml(authors)}</p>` : ''}
          ${narrators ? `<p class="crew-line"><strong>Narrated by</strong> ${escapeHtml(narrators)}</p>` : ''}
          ${r.series ? `<p class="crew-line"><strong>Series</strong> ${escapeHtml(r.series)}${r.series_sequence ? ` #${escapeHtml(r.series_sequence)}` : ''}</p>` : ''}
          <div class="stats">
            ${r.runtime_minutes ? `<span>${formatDuration(r.runtime_minutes)}</span>` : ''}
            ${r.rating ? `<span>★ ${r.rating}</span>` : ''}
          </div>
          ${r.description ? `<p class="overview">${escapeHtml(r.description)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'audiobooks', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Comics ----
async function exportComics(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM comics ORDER BY title COLLATE NOCASE').all();
  counts.comics = rows.length;
  const dir = path.join(root, 'comics');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(r.series ? `${r.series}${r.issue_number ? ` #${r.issue_number}` : ''}` : '')}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'comics', heading: 'Comics', countLabel: 'issue', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${r.series ? `<p class="director">${escapeHtml(r.series)}${r.issue_number ? ` #${escapeHtml(r.issue_number)}` : ''}</p>` : ''}
          ${r.publisher ? `<p class="crew-line"><strong>Publisher</strong> ${escapeHtml(r.publisher)}</p>` : ''}
          ${r.description ? `<p class="overview">${escapeHtml(r.description)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'comics', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Ebooks ----
async function exportEbooks(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM ebooks ORDER BY title COLLATE NOCASE').all();
  counts.ebooks = rows.length;
  const dir = path.join(root, 'ebooks');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => {
    const authors = namesOf(r.authors);
    return `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(authors)}</div>
        </a>`;
  };
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'ebooks', heading: 'Ebooks', countLabel: 'ebook', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const authors = namesOf(r.authors);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${authors ? `<p class="director">by ${escapeHtml(authors)}</p>` : ''}
          <div class="stats">
            ${r.page_count ? `<span>${r.page_count} pages</span>` : ''}
            ${r.publisher ? `<span>${escapeHtml(r.publisher)}</span>` : ''}
          </div>
          ${r.description ? `<p class="overview">${escapeHtml(r.description)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'ebooks', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Digital (albums) ----
async function exportAlbums(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM albums ORDER BY title COLLATE NOCASE').all();
  counts.albums = rows.length;
  const dir = path.join(root, 'albums');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(r.artist || '')}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'albums', heading: 'Digital', countLabel: 'album', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const genres = parseJsonArray(r.genres);
    const tracks = parseJsonArray(r.tracks);
    const trackList = tracks.length
      ? `<ol class="tracklist">${tracks.map((t) => `<li><span>${escapeHtml(t.title || '')}</span></li>`).join('')}</ol>`
      : '';
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${r.artist ? `<p class="director">${escapeHtml(r.artist)}</p>` : ''}
          ${tagList(genres)}
          ${trackList}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'albums', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Vinyl ----
async function exportVinyl(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM vinyl_records ORDER BY title COLLATE NOCASE').all();
  counts.vinyl = rows.length;
  const dir = path.join(root, 'vinyl');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(r.artist || '')}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'vinyl', heading: 'Vinyl', countLabel: 'record', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const genres = parseJsonArray(r.genres);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${r.year ? `<span class="year">(${r.year})</span>` : ''}</h1>
          ${r.artist ? `<p class="director">${escapeHtml(r.artist)}</p>` : ''}
          ${tagList(genres)}
          <div class="stats">
            ${r.label ? `<span>${escapeHtml(r.label)}</span>` : ''}
            ${r.catalog_number ? `<span>${escapeHtml(r.catalog_number)}</span>` : ''}
            ${r.format ? `<span>${escapeHtml(r.format)}</span>` : ''}
          </div>
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'vinyl', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

// ---- Games ----
async function exportGames(root, referencedPosters, counts) {
  const rows = db.prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE').all();
  counts.games = rows.length;
  const dir = path.join(root, 'games');
  fs.mkdirSync(dir, { recursive: true });

  const card = (r) => `        <a href="${r.id}.html" class="card">
          ${posterBlock(r.cover_file, r.title, referencedPosters)}
          <div class="card-title">${escapeHtml(r.title)}</div>
          <div class="card-meta">${escapeHtml(r.platform || '')}</div>
        </a>`;
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    gridPage({ typeKey: 'games', heading: 'Games', countLabel: 'game', items: rows, cardHtml: card })
  );

  let i = 0;
  for (const r of rows) {
    const genres = parseJsonArray(r.genres);
    const body = `
      <div class="detail-body">
        <div class="detail-poster">${posterBlock(r.cover_file, r.title, referencedPosters)}</div>
        <div class="detail-info">
          <h1>${escapeHtml(r.title)} ${yearFromDate(r.release_date) ? `<span class="year">(${yearFromDate(r.release_date)})</span>` : ''}</h1>
          ${r.platform ? `<p class="director">${escapeHtml(r.platform)}</p>` : ''}
          ${tagList(genres)}
          <div class="stats">
            ${r.developer ? `<span>${escapeHtml(r.developer)}</span>` : ''}
            ${r.publisher ? `<span>${escapeHtml(r.publisher)}</span>` : ''}
            ${r.rating ? `<span>${escapeHtml(r.rating)}</span>` : ''}
          </div>
          ${r.overview ? `<p class="overview">${escapeHtml(r.overview)}</p>` : ''}
        </div>
      </div>`;
    fs.writeFileSync(
      path.join(dir, `${r.id}.html`),
      pageShell({ title: `${r.title} — Media Catalog`, activeKey: 'games', bodyHtml: body })
    );
    if (++i % 50 === 0) await yieldEventLoop();
  }
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.manifest.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

function listHtmlExports() {
  fs.mkdirSync(HTML_EXPORT_DIR, { recursive: true });
  return fs
    .readdirSync(HTML_EXPORT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('library-export-'))
    .map((e) => {
      const full = path.join(HTML_EXPORT_DIR, e.name);
      const manifest = readManifest(full);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        created_at: manifest?.generated_at || stat.mtime.toISOString(),
        total_items: manifest?.total_items ?? null,
        size: dirSize(full),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function deleteHtmlExport(name) {
  fs.rmSync(safeHtmlExportPath(name), { recursive: true, force: true });
}

function streamHtmlExportZip(name, res) {
  const full = safeHtmlExportPath(name);
  if (!fs.existsSync(full)) throw new Error('Export not found');
  res.attachment(`${name}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.destroy(err));
  archive.pipe(res);
  archive.directory(full, false);
  archive.finalize();
}

module.exports = {
  TEXT_EXPORT_DIR,
  HTML_EXPORT_DIR,
  listTextExports,
  deleteTextExport,
  safeTextExportPath,
  runTextExport,
  listHtmlExports,
  deleteHtmlExport,
  safeHtmlExportPath,
  streamHtmlExportZip,
  runHtmlExport,
};
