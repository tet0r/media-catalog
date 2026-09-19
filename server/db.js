const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'posters'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'library.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  overview TEXT,
  tagline TEXT,
  runtime INTEGER,
  genres TEXT,
  director TEXT,
  cast TEXT,
  crew TEXT,
  poster_file TEXT,
  backdrop_file TEXT,
  tmdb_rating REAL,
  vote_count INTEGER,
  imdb_id TEXT,
  budget INTEGER,
  revenue INTEGER,
  status TEXT,
  original_language TEXT,
  homepage TEXT,
  production_companies TEXT,
  spoken_languages TEXT,
  file_path TEXT,
  format TEXT DEFAULT 'File',
  location TEXT,
  purchase_date TEXT,
  purchase_price REAL,
  purchase_store TEXT,
  personal_rating INTEGER,
  notes TEXT,
  loaned_to TEXT,
  watched INTEGER DEFAULT 0,
  tags TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE,
  guessed_title TEXT,
  guessed_year INTEGER,
  candidates TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS scan_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  running INTEGER DEFAULT 0,
  last_run TEXT,
  files_found INTEGER DEFAULT 0,
  matched INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  removed INTEGER DEFAULT 0,
  message TEXT
);
`);

// Migrate existing databases created before a column existed (SQLite has
// no "ADD COLUMN IF NOT EXISTS", so check first).
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('scan_status', 'removed', 'INTEGER DEFAULT 0');
ensureColumn('movies', 'tagline', 'TEXT');
ensureColumn('movies', 'crew', 'TEXT');
ensureColumn('movies', 'vote_count', 'INTEGER');
ensureColumn('movies', 'imdb_id', 'TEXT');
ensureColumn('movies', 'budget', 'INTEGER');
ensureColumn('movies', 'revenue', 'INTEGER');
ensureColumn('movies', 'status', 'TEXT');
ensureColumn('movies', 'original_language', 'TEXT');
ensureColumn('movies', 'homepage', 'TEXT');
ensureColumn('movies', 'production_companies', 'TEXT');
ensureColumn('movies', 'spoken_languages', 'TEXT');
ensureColumn('movies', 'content_rating', 'TEXT');

db.prepare('INSERT OR IGNORE INTO scan_status (id, running) VALUES (1, 0)').run();

module.exports = db;
