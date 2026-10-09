# Media Catalog

A self-hosted, Docker-deployable media collection cataloger — Movies, TV
Shows, Audiobooks, Comics, Ebooks, Music (Digital + Vinyl), and Games. Each
media type gets its own sidebar tab, library scanner, and Settings section.

The running app's version shows next to its name in the nav bar (from the
`VERSION` file) and at `GET /api/health` — handy for confirming a Portainer
redeploy actually picked up a new image. See
[CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## Quick start

Assumes Docker and your media files are on the same machine — see
**Network shares** below if they're on a NAS or another PC instead.

1. Copy `docker-compose.yml` and `.env.example` → `.env`, both next to each
   other.
2. In `.env`, point the `*_PATH` variable at your actual local folder for
   whichever media type(s) you're using, and get a free
   [TMDB API key](https://www.themoviedb.org/settings/api) (required for
   Movies — everything else is optional, see **Media types** below).
3. `docker compose up -d`
4. Open **http://localhost:8080**.
5. Use each media type's "Scan Library" (or "Sync") button to import your
   collection.

## Media types

- **Movies** — [TMDB](https://www.themoviedb.org/). Needs `TMDB_API_KEY`.
  Point `MOVIES_PATH` at your movie folder.
- **TV Shows** — [TheTVDB](https://www.thetvdb.com). Free key from your
  [dashboard](https://www.thetvdb.com/dashboard/account/apikeys) — paste
  into Settings or set `TVDB_API_KEY`. Point `TV_PATH` at your TV folder; a
  show is identified by its top-level folder only, however many
  seasons/episodes are underneath.
- **Audiobooks** — Audible via [Audnexus](https://audnex.us), no key
  needed. Point `AUDIOBOOKS_PATH` at your audiobook folder.
- **Comics** — [ComicVine](https://comicvine.gamespot.com/api/) by default,
  with [Metron](https://metron.cloud) and the
  [Grand Comics Database](https://www.comics.org) as automatic fallbacks
  for every search and scan (handy since ComicVine rate-limits fairly
  aggressively) — GCD needs no account at all, Metron a free one. Free
  ComicVine key from your [GameSpot account](https://comicvine.gamespot.com/api/)
  — paste into Settings or set `COMICVINE_API_KEY`; Metron username/password
  go in Settings too, or `METRON_USERNAME`/`METRON_PASSWORD`. Point
  `COMICS_PATH` at your comics folder (`.cbz`/`.cbr`/`.cb7`); matched
  per-issue, commonly the same share as your audiobooks, just a different
  sub-path.
- **Ebooks** — [Open Library](https://openlibrary.org), no key needed.
  Point `EBOOKS_PATH` at your ebook folder (`.epub`/`.pdf`/`.mobi`/`.azw3`).
- **Music (Digital)** — [Last.fm](https://www.last.fm) by default; a free
  key from [last.fm/api/account/create](https://www.last.fm/api/account/create)
  is optional (falls back to keyless [MusicBrainz](https://musicbrainz.org)
  without one). Point `ALBUMS_PATH` at your music folder — one folder per
  album.
- **Vinyl** — mirrors your [Discogs](https://www.discogs.com) collection
  directly; no local files. Generate a token at
  [discogs.com/settings/developers](https://www.discogs.com/settings/developers),
  enter it and your username in Settings, then click Sync.
- **Games** — mirrors a [LaunchBox](https://www.launchbox-app.com) library.
  LaunchBox usually runs on a different PC, so this app reads a synced copy
  of its `Data`/`Images` folders instead of talking to LaunchBox directly —
  see below.

Each media type's folders can also be chosen in the app itself, under
Settings > (that type) > Library folders — the environment variables above
are just the starting point/fallback, and a folder set in Settings
overrides them (and takes effect on the next scan, no restart needed).
Settings also has an Appearance page for light/dark mode.

Vinyl and Games both stay in sync one-way: edit your collection on
Discogs/LaunchBox itself, then click Sync here to catch up. This applies to
every media type, not just these two: metadata is only ever refreshed by an
explicit, manual action — a "Sync Now"/"Refresh Metadata" click — never
silently by a scheduled auto-sync/auto-scan. An automatic run still finds
new items (and, for Vinyl/Games, prunes ones removed from the source), it
just never rewrites an item already in your library; only clicking Sync
yourself does that.

### Games setup (LaunchBox)

1. On the LaunchBox PC, find your LaunchBox install's `Data` and `Images`
   subfolders.
2. Keep a synced copy of just those two on the Docker host — a scheduled
   robocopy, rsync, or Syncthing all work. `Images` can be trimmed to each
   platform's `Box - Front` subfolder to save space.
3. Set `LAUNCHBOX_SYNC_PATH` (in `.env`) to that local folder.
4. Click "Sync from LaunchBox" (or enable auto-sync in Settings).

## Deploying via Portainer

The image is published to GHCR, so you can paste the compose file directly
into Portainer — no repo access needed on the Docker host.

1. Make the GHCR package public (GitHub Packages default to private): your
   GitHub profile → **Packages** → `media-catalog` → **Package settings**
   → **Change visibility** → **Public**. (Or keep it private and add a
   GHCR credential under Portainer's **Registries** instead.)
2. **Stacks → Add stack**, name it, build method **Web editor**, paste in
   `docker-compose.yml`.
3. Under **Environment variables**, add `TMDB_API_KEY` and whichever
   `*_PATH`/`*_SYNC_PATH` variables you need — same names as
   `.env.example`.
4. **Deploy the stack**.
5. To ship a later update: push to `main` (rebuilds the image via GitHub
   Actions), then in Portainer open the stack and **Pull and redeploy**.

## Network shares

If your media library lives on a **different machine** than the one
running Docker (a NAS, another PC), use `docker-compose.network-shares.yml`
instead of `docker-compose.yml` — it mounts each share directly via
CIFS/SMB rather than a local bind mount, which is what actually works
reliably on Docker Desktop's WSL2 backend (a plain `//server/share` bind
mount there silently resolves to an empty folder, no error).

1. In `.env`, set `SMB_HOST` (the share PC's **IP address**, not its
   hostname — the Linux VM can't resolve Windows NetBIOS names),
   `SMB_USER`/`SMB_PASS`, and `SMB_SHARE1`/`SMB_SHARE_AUDIOBOOKS`/`SMB_SHARE_COMICS`/etc. (each
   share's sub-path, e.g. `movies/Movies`) — see the commented-out block at
   the bottom of `.env.example`.
2. `docker compose -f docker-compose.network-shares.yml up -d` (or paste
   that file into Portainer instead, with the same environment variables).

If a scan finds 0 files despite the share existing, check
`docker compose logs media-catalog` and
`docker volume inspect media-catalog_movies1` for a CIFS mount error (bad
credentials, unreachable host, wrong path) — a comma in `SMB_PASS` also
breaks the mount option string, so avoid that.

## Data & backups

Everything (the database and cached posters/covers) lives under `./data`.
**If deploying via Portainer's web editor**, a relative path like `./data`
resolves to a folder Portainer manages for you, and some stack changes can
cause it to get silently recreated from scratch — abandoning your existing
collection with no warning. Point `./data` at an explicit host path you
control instead if you want stronger protection than backups alone.

Settings has a Backups section (manual "Back Up Now" plus an optional
schedule, with retention) that snapshots just the database, and a Restore
button for it. Point `BACKUP_SYNC_PATH` somewhere genuinely independent of
`./data` — a different disk or share — so a backup isn't wiped out by the
same event that could reset `./data`.

The same Settings section also has a Library Export: "Export to Text" writes
one plain-text file (a section per media type, sorted alphabetically) for
a quick read-only list, and "Export to HTML" writes a static, browsable
site that visually matches the app itself (library grids + a detail page
per item) but with no Settings/Add/Scan functionality — open its
`index.html` directly, or download it as a `.zip`. Both land in
`BACKUP_DIR/exports/` (text/ and html/ subfolders), alongside your backups.

## Local development (without Docker)

```bash
# terminal 1 — API server
cd server
npm install
TMDB_API_KEY=your_key DATA_DIR=./data MOVIES_DIR=/path/to/movies AUDIOBOOKS_DIR=/path/to/audiobooks COMICS_DIR=/path/to/comics EBOOKS_DIR=/path/to/ebooks ALBUMS_DIR=/path/to/albums node index.js

# terminal 2 — frontend dev server (proxies /api to :8080)
cd client
npm install
npm run dev
```

Then open http://localhost:5173.
