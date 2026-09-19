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

-- Same permanent-exclusion idea as audiobook_ignored below — "Skip this
-- file" only dismisses a Needs Review item for that one review, since the
-- path isn't recorded anywhere and the next scan finds it again.
CREATE TABLE IF NOT EXISTS movie_ignored (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE,
  guessed_title TEXT,
  guessed_year INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audiobooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The catalog ID from whichever source metadata_source names — an
  -- Audible ASIN or an Apple Books/iTunes numeric collection ID. The
  -- column name predates multi-source support; kept as-is rather than
  -- renamed to avoid a churny migration for what's an internal detail.
  asin TEXT,
  metadata_source TEXT DEFAULT 'audible',
  title TEXT NOT NULL,
  subtitle TEXT,
  authors TEXT,
  narrators TEXT,
  series TEXT,
  series_sequence TEXT,
  description TEXT,
  genres TEXT,
  release_date TEXT,
  year INTEGER,
  runtime_minutes INTEGER,
  publisher TEXT,
  language TEXT,
  rating REAL,
  abridged INTEGER DEFAULT 0,
  cover_file TEXT,
  -- The m4b file's path, or the containing folder's path for a multi-file
  -- (mp3/m4a/...) book — see lib/audiobookScanner.js for why a folder is
  -- the unit of identity in the multi-file case, not any one file in it.
  file_path TEXT,
  -- JSON array of every constituent audio file, in playback order. For an
  -- m4b book this is just [file_path]; kept as its own column rather than
  -- derived so a multi-part book's file list survives even if file_path
  -- (the folder) briefly looks unhealthy during a scan.
  file_parts TEXT,
  source_format TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audiobook_scan_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE,
  file_parts TEXT,
  source_format TEXT,
  guessed_title TEXT,
  candidates TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Paths a scan should never surface again, even though they're not (and
-- may never become) an actual audiobooks row — e.g. a bonus/sample file,
-- or something the scanner's own folder-grouping got wrong for. "Skip
-- this" on a Needs Review item just dismisses it from *this* review, but
-- since the pending row is gone and the path was never in audiobooks
-- either, an unignored path is exactly like new to the next scan and
-- surfaces right back. This table is the permanent version of that.
CREATE TABLE IF NOT EXISTS audiobook_ignored (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE,
  guessed_title TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audiobook_scan_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  running INTEGER DEFAULT 0,
  last_run TEXT,
  files_found INTEGER DEFAULT 0,
  matched INTEGER DEFAULT 0,
  pending INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  removed INTEGER DEFAULT 0,
  errored INTEGER DEFAULT 0,
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
ensureColumn('audiobook_scan_status', 'errored', 'INTEGER DEFAULT 0');
ensureColumn('audiobooks', 'metadata_source', "TEXT DEFAULT 'audible'");

db.prepare('INSERT OR IGNORE INTO scan_status (id, running) VALUES (1, 0)').run();
db.prepare('INSERT OR IGNORE INTO audiobook_scan_status (id, running) VALUES (1, 0)').run();

module.exports = db;
