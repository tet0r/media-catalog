# Media Catalog (self-hosted CLZ Movies / CLZ Music alternative)

A self-hosted, Docker-deployable media collection cataloger, inspired by
[CLZ Movies](https://clz.com/movies) and its siblings. Currently covers:

- **Movies** — posters, cast/crew, plot, ratings; see "How it differs from
  CLZ Movies" below.
- **Audiobooks** — cover, author/narrator, series, description, via Audible/
  Audnexus; see **Audiobooks** below.
- **Ebooks** — cover, author(s), description, genres, via Open Library; see
  **Ebooks** below.
- **Music (Albums)** — cover, artist, tracklist, genres, via MusicBrainz; see
  **Music** below. (A Discogs-backed **Vinyl** section lives alongside it —
  see **Vinyl** below.)
- **Games** — cover, platform, developer/publisher, genres, overview, mirrored
  from a local LaunchBox installation; see **Games** below.
- **TV Shows** — poster, network, cast, genres, overview, via TheTVDB; see
  **TV** below.

Each media type gets its own tab in the left sidebar, its own library-folder
scanner, and its own section in Settings — more types can be added the same
way later.

The running app's version is shown next to its name in the nav bar (from the
`VERSION` file) and returned by `GET /api/health` — handy for confirming a
Portainer redeploy actually picked up a new image. See
[CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## How it differs from CLZ Movies

CLZ Movies is a paid app with an official (licensed) IMDb data feed and
barcode-database lookups. Neither is available for free/self-hosting, so this
app uses:

- **[TMDB](https://www.themoviedb.org/)** (free API) instead of the licensed
  IMDb feed, for posters, cast/crew, plot, runtime and ratings.
- **Library folder scanning** instead of barcode scanning: point the app at
  the folder(s) where your movie files live, and it walks the folder, guesses
  each movie's title/year from the filename or folder name (the same way
  Radarr/Jellyfin do), and matches it against TMDB. Confident matches are
  added automatically; anything ambiguous goes into a "Needs Review" queue
  where you pick the right match (or skip it).
- **Single user, no login** — this is meant to run on your own network for
  your own use, like a personal Homebox/Jellyfin instance.

Everything else — manual title search & add, editable personal fields
(format, location, purchase date/price/store, your own 1-5 rating, notes,
loaned-to, watched flag), grid browsing with search/sort/filter — works the
same way.

## Audiobooks

Metadata comes from Audible's own (unofficial, undocumented but widely
relied on) catalog search, resolved to full details — cover, author(s),
narrator(s), series, description, genres, runtime — via
[Audnexus](https://audnex.us), the same pairing self-hosted audiobook
tools like Audiobookshelf use under the hood.

Point `AUDIOBOOKS_DIR` at the folder(s) where your audiobooks live, same
comma-separated-multi-path support as `MOVIES_DIR`.

## Ebooks

Metadata comes from [Open Library](https://openlibrary.org)'s free, no-key
public API — cover, author(s), description, genres, publisher, page count,
ISBN. Scans pick up `.epub`, `.pdf`, `.mobi` and `.azw3` files, one entry per
file (unlike audiobooks, an ebook is never split across multiple files).

Point `EBOOKS_DIR` at the folder(s) where your ebooks live, same
comma-separated-multi-path support as `MOVIES_DIR`/`AUDIOBOOKS_DIR` — commonly
the same network share as your audiobooks, just a different sub-path.

## Music

Metadata comes from [Last.fm](https://www.last.fm) by default, with
[MusicBrainz](https://musicbrainz.org) (cover art via the
[Cover Art Archive](https://coverartarchive.org)) as a second, independent
search source in **Add Album** and **Needs Review**, for the occasional
album Last.fm's own search misses. Last.fm needs a free API key — get one
at [last.fm/api/account/create](https://www.last.fm/api/account/create) and
add it in Settings — while MusicBrainz needs none.

**Without a Last.fm key configured**, both scans and the default Add
Album/Needs Review tab fall back to MusicBrainz automatically, so the app
still works out of the box with zero setup — you only need a key if you
want Last.fm as the default. MusicBrainz also limits unauthenticated
clients to **1 request per second**, so a full library scan or bulk
metadata refresh over MusicBrainz is correspondingly slower than the other
media types' (a handful of seconds per album, not per-file); Last.fm's own
limit is more generous.

Unlike the other media types, an album is a **folder** of tracks, not a
single file — scans pick up `.mp3`, `.flac`, `.m4a` and `.ogg` files and
group every folder that has them directly inside into one album. The
artist/album used for matching comes from the first track's own embedded
tags (ID3v2/v1, Vorbis comments, or iTunes-style atoms, depending on
format) when it has them — reading a file's own tags beats guessing from
folder names, and no dependency on your folder naming convention. Only
when a track has no usable tags does it fall back to the folder name,
recognizing either an `Artist/Album/tracks` (two nested folders) or a flat
`Artist - Album/tracks` layout automatically; you don't need to know in
advance which one your library uses.

A multi-disc release split across sibling folders (e.g. `Album CD1`/
`Album CD2`, or `Disc 1`/`Disc 2`) is recognized as **one** album, not
two — their tracks are combined in disc order and the disc marker is
stripped from the guessed name before matching. A lone folder that happens
to say "Disc 1" with no sibling isn't treated as multi-disc, since that's
just its actual name.

Point `ALBUMS_DIR` at the folder(s) where your music lives, same
comma-separated-multi-path support as `MOVIES_DIR`/`AUDIOBOOKS_DIR`/`EBOOKS_DIR`
— commonly the same network share as those, just a different sub-path.

Got the wrong match? Every album's own page has a **Search Again** button
— pick a different result from either Last.fm or MusicBrainz and it
re-points that same folder(s) at the new match (cover included), without
deleting and re-adding the album.

Removing an album from its own page adds its folder(s) to Ignored
automatically, so a re-scan doesn't just re-discover and re-add it right
back — un-ignore it (Scan Library's Ignored tab) if you change your mind.
This only applies to the single "Remove from Collection" action; Settings'
"Clear Library" is a bulk reset meant to be followed by a fresh re-scan, so
it doesn't ignore anything.

## Vinyl

Unlike every other media type here, Vinyl doesn't scan any local files —
it's a direct mirror of a collection you already maintain on
[Discogs](https://www.discogs.com). There's no folder to point it at and no
env var for it; instead, generate a Personal Access Token at
[discogs.com/settings/developers](https://www.discogs.com/settings/developers)
("Generate new token") and enter it, along with your username, in Settings.
Click "Sync from Discogs" (or turn on auto-sync) and it pulls your whole
collection — cover, artist, format, label, genres — via the Discogs API,
which is free and needs no separate key beyond that token.

Discogs stays the source of truth: add, edit or remove records on Discogs
itself, then sync again here to catch up. Removing something from the local
copy in this app (or clearing the whole local copy in Settings) doesn't
touch your actual Discogs collection — it just comes back on the next sync.

## Games

Like Vinyl, Games doesn't scan/match anything — it mirrors a library you've
already built in [LaunchBox](https://www.launchbox-app.com), the free
game-launcher app. LaunchBox has no public search API (and no documented
scraping-free path to one), but its desktop app already downloads per-game
metadata (title, platform, developer, genre, box art, ...) as plain files
for offline use once you've imported/identified your games there — this app
just reads those files directly instead of hitting LaunchBox's site.

Since LaunchBox usually runs on a different PC than the one hosting this
app, there's no live network-share mount for it the way Movies/Audiobooks/
Ebooks/Albums have. Instead:

1. On the LaunchBox PC, locate your LaunchBox install folder (Start Menu →
   right-click the LaunchBox shortcut → "Open file location" if unsure) and
   find its `Data` and `Images` subfolders.
2. Keep a synced copy of just those two folders somewhere reachable by the
   Docker host — a scheduled `robocopy`, rsync, or a sync tool like
   Syncthing all work. You only need `Data` (the metadata) and `Images`
   (the box art — you can limit this to each platform's `Box - Front`
   subfolder to save space, e.g. `Images\Sony Playstation\Box - Front\`).
   You don't need `Core`, `ROMs`, `Themes`, etc.
3. In `.env`, set `LAUNCHBOX_SYNC_PATH` to that local folder on the Docker
   host (e.g. `C:\LaunchBoxSync`) — `docker-compose.yml` bind-mounts it to
   `/launchbox` and `LAUNCHBOX_DIR=/launchbox` tells the app where to look.
4. Click "Sync from LaunchBox" on the Games page (or turn on auto-sync in
   Settings).

LaunchBox stays the source of truth: add, edit or remove games there (then
re-sync your copied folders and click sync here to catch up). Removing a
game from the local copy in this app (or clearing the whole local copy in
Settings) doesn't touch your actual LaunchBox library — it just comes back
on the next sync.

## TV

Works just like Movies — point it at a folder, scan, and it matches what it
finds against a metadata source, this time [TheTVDB](https://www.thetvdb.com)
instead of TMDB. The one thing that's different: **a show is identified by
its own top-level folder only.** A scan never looks inside season
subfolders to decide what a show is — `TV/Cheers/Season 1/...` is never
scanned as anything other than part of `TV/Cheers`, so "Cheers" shows up
once in your collection no matter how many seasons or episodes are under
it. A folder only counts as a show if it (or something inside it, at any
depth) actually contains a video file — an empty folder or one with just
NFOs/subtitles is skipped.

1. Create a free account at [thetvdb.com](https://www.thetvdb.com), then
   generate a v4 API key from your
   [dashboard's API Keys page](https://www.thetvdb.com/dashboard/account/apikeys).
   Paste it into Settings (or set `TVDB_API_KEY`). Free for personal/
   non-commercial use — see
   [TheTVDB's API and Data Licensing](https://www.thetvdb.com/api-information)
   for the details of that tier. **Attribution**: TV metadata and images in
   this app are provided by TheTVDB, but this app is not endorsed or
   certified by TheTVDB or its affiliates.
   - Only fill in the "TheTVDB Subscriber PIN" field in Settings if your key
     specifically is the user-subscription-funded kind (TheTVDB tells you
     this when you generate it) — leave it blank otherwise.
2. Mount your TV folder the same way as Movies/Audiobooks/Ebooks/Albums —
   `TV_DIR` env var + a share/mount in `docker-compose.yml` (`SMB_SHARE_TV`
   if it's a network share; see **Network shares** below).
3. Go to **Scan Library** under TV Shows to import, or **Add Show** to
   search TheTVDB by title and add manually.

## Setup

1. **Get a free TMDB API key**: sign up at themoviedb.org, then go to
   [Settings → API](https://www.themoviedb.org/settings/api) and request a
   free "Developer" API key (approved instantly for personal use).

2. **Point it at your movie, audiobook, ebook, music and/or TV folders.** If
   they're on local disk, just bind mount them directly
   (`- /path/to/movies:/movies:ro`) and add `/movies` to the `MOVIES_DIR` env
   var (same idea for audiobooks/`AUDIOBOOKS_DIR`, ebooks/`EBOOKS_DIR`,
   music/`ALBUMS_DIR` and TV/`TV_DIR`). **If they're on a network share (NAS,
   another PC), see Network shares below first** — plain bind-mounting a
   network path is unreliable on Docker Desktop and needs a different setup.

   If a library is split across multiple shares/folders, give each one its
   own mount point (`/movies`, `/movies2`, `/movies3`, ...) **and** add it
   to the corresponding environment variable — the scanner only looks at
   paths listed there, so a volume mounted but left out of `MOVIES_DIR` (or
   `AUDIOBOOKS_DIR`/`EBOOKS_DIR`/`ALBUMS_DIR`) will silently never get scanned.

3. **Set your API key and (if using network shares) SMB details**: copy
   `.env.example` to `.env` and fill it in — or leave `TMDB_API_KEY` blank
   and paste it into the app's Settings page after it's running.

4. **Pull and run:**

   ```bash
   docker compose up -d
   ```

   (This pulls the pre-built image from GHCR. If you want to build from
   source instead, run `docker build -t ghcr.io/tet0r/media-catalog:latest .`
   first.)

5. Open **http://localhost:8080** (or `http://<your-server-ip>:8080` from
   another device on your network).

6. Go to **Scan Library** to import movies from your files, or **Add Movie**
   to search TMDB by title and add manually.

## Deploying via Portainer (Web editor)

Since the image is published to GHCR, you can just paste the compose file
directly into Portainer — no repo access from the Docker host needed.

1. Confirm the GHCR image is public — GitHub publishes new packages as
   *private* by default, so Portainer (or `docker pull`) won't be able to
   fetch it until you make it public: go to your GitHub profile →
   **Packages** tab (or
   `https://github.com/users/tet0r/packages/container/package/media-catalog`),
   then **Package settings** → **Change visibility** → **Public**.
   (Alternatively, keep it private and give Portainer a GHCR credential
   under **Registries**.) The compose file itself needs no editing for
   this — your share paths aren't in it (see **Network shares** below).

2. In Portainer: **Stacks → Add stack**.
   - Name it (e.g. `media-catalog`).
   - Build method: **Web editor**.
   - Paste the full contents of this repo's `docker-compose.yml` as-is.

3. Under **Environment variables**, add (Portainer's stack env vars, not a
   local `.env` file, are what fill in the `${...}` references when
   deployed this way):
   - `TMDB_API_KEY` = your TMDB key (or leave it blank and paste it into the
     app's Settings page after it's running)
   - `SMB_HOST` = the IP address of the PC hosting your shares
   - `SMB_USER` / `SMB_PASS` = credentials for that share
   - `SMB_SHARE1` / `SMB_SHARE2` / `SMB_SHARE3` = each movie share's
     sub-path, e.g. `movies/Movies`
   - `SMB_SHARE_AUDIOBOOKS` = the audiobook folder's sub-path (can be on
     the same share as the movies, just a different sub-path)
   - `SMB_SHARE_EBOOKS` = the ebook folder's sub-path, same idea again
   - `SMB_SHARE_ALBUMS` = the music folder's sub-path, same idea again
   - `SMB_SHARE_TV` = the TV folder's sub-path, same idea again
   - `TVDB_API_KEY` = if using TV, your TheTVDB API key (or leave it blank
     and paste it into Settings instead) — see **TV** above
   - `LAUNCHBOX_SYNC_PATH` = if using Games, a path *on the Docker host
     itself* (not a network share) with your synced LaunchBox `Data`/
     `Images` folders — see **Games** above
   - `BACKUP_SYNC_PATH` = a path *on the Docker host itself*, genuinely
     independent of wherever `./data` lands, to store database backups —
     see **Backups** above

4. Click **Deploy the stack**. Portainer pulls
   `ghcr.io/tet0r/media-catalog:latest` and starts the container — no
   source clone or build on the Docker host.

5. To ship a later change, push to `main` (which re-triggers the GitHub
   Actions build), then in Portainer open the stack and click
   **Pull and redeploy** so it grabs the new `:latest` image.

   (If you'd rather have Portainer build from source itself instead of
   pulling a registry image, use **Stacks → Add stack → Repository**
   pointed at `https://github.com/tet0r/media-catalog.git` with a
   `build: .` compose file instead — either approach works.)

## Network shares (Docker Desktop + WSL2)

**Don't bind-mount a `//server/share` path directly** (`- "//SERVER/Movies:/movies:ro"`)
and don't use a mapped drive letter (`Z:\Movies`) either. Both are known to
be unreliable on Docker Desktop's WSL2 backend: the container starts with no
error, but the mount silently resolves to an empty directory, because
neither the raw UNC path nor a per-login-session drive letter reliably makes
it through Windows → WSL2 → the container. If your scan finds 0 files despite
the share clearly existing, this is almost always why.

The fix that actually works reliably: mount the SMB share directly, using
the Linux kernel's own CIFS client running inside Docker Desktop's WSL2 VM
— this bypasses Windows' path translation entirely. `docker-compose.yml`
already does this via CIFS-backed named volumes:

```yaml
volumes:
  movies1:
    driver: local
    driver_opts:
      type: cifs
      o: "username=${SMB_USER},password=${SMB_PASS},vers=3.0,ro,file_mode=0444,dir_mode=0555"
      device: "//${SMB_HOST}/${SMB_SHARE1}"
```

Note that none of your actual folder names/paths live in `docker-compose.yml`
itself — they're all environment variables (`SMB_HOST`, `SMB_SHARE1/2/3`,
`SMB_SHARE_AUDIOBOOKS`, `SMB_SHARE_EBOOKS`, `SMB_SHARE_ALBUMS`, `SMB_SHARE_TV`), so this file stays generic even
if the repo is public. Your real values go in `.env`, which is gitignored, or
in Portainer's stack environment variables (which aren't part of the compose
file either).

To use it:

1. In `.env` (copy from `.env.example`), set:
   - `SMB_HOST` — the share PC's **IP address**, not its hostname. The
     Linux VM doesn't resolve Windows NetBIOS hostnames the way Windows
     itself does, so a hostname here is a common silent-failure point. Find
     the IP with `ipconfig` on that PC, or your router's device list.
   - `SMB_USER` / `SMB_PASS` — credentials for the share. If it allows
     guest/anonymous access instead, set `SMB_USER=guest` and remove the
     `password=${SMB_PASS},` part of the `o:` option for each volume in
     `docker-compose.yml`.
   - `SMB_SHARE1` / `SMB_SHARE2` / `SMB_SHARE3` — each movie share's
     sub-path relative to `//SMB_HOST/`, e.g. `movies/Movies`.
   - `SMB_SHARE_AUDIOBOOKS` — the audiobook folder's sub-path, same idea
     (can be on the very same share, just a different sub-path — that's
     the common case, since it's usually all one NAS).
   - `SMB_SHARE_EBOOKS` — the ebook folder's sub-path, same idea again.
   - `SMB_SHARE_ALBUMS` — the music folder's sub-path, same idea again.
   - `SMB_SHARE_TV` — the TV folder's sub-path, same idea again.
2. `docker compose up -d` (or redeploy the Portainer stack, with those same
   variables set under its Environment variables instead of `.env`). Docker
   creates the named volumes by mounting each CIFS share the first time
   they're used.

**If it still doesn't work**, check `docker compose logs media-catalog`
and `docker volume inspect media-catalog_movies1` — a CIFS mount failure
(bad credentials, unreachable host, wrong share path) shows up there as an
actual error, unlike the plain-bind-mount case which fails silently. Note
that `password=` in the `o:` option breaks if your password contains a
comma (the option string is comma-delimited) — change the password if so.

## Data & persistence

Everything (the SQLite database and cached poster/cover images) lives under
`./data` next to `docker-compose.yml`, via the `/data` volume.

**If you're deploying via Portainer's web editor, read this carefully.** A
relative path like `./data` resolves to a folder Portainer manages for
you — on Windows with Docker Desktop, typically somewhere under Docker
Desktop's own internal WSL2 storage, not a location you'd normally browse
to. Some stack changes (adding/removing a top-level `volumes:` entry, for
example) can cause Portainer/Compose to recreate that folder from scratch
rather than reusing the existing one — silently starting you over with an
empty database while the old one (with your whole collection in it) is
abandoned in a now-orphaned folder that eventually gets garbage-collected.
Nothing in the app or in Docker warns you when this happens; the container
just starts up fine with a fresh, empty `/data`.

This isn't hypothetical — it's exactly what **Backups** (below) exists to
protect against. If you want stronger protection than a backup rotation
alone, consider pointing `./data` at an explicit host path you control
(e.g. a folder on a NAS share) instead of a relative one, so its identity
doesn't depend on Portainer's own internal bookkeeping.

## Backups

Settings has a Backups section: a manual "Back Up Now" button, and an
optional automatic schedule (every 6/12 hours, daily, every 3 days, or
weekly), with a configurable retention count (oldest backups beyond that,
manual and automatic together, get deleted after each new one).

Only the database gets backed up — your collection, matches, personal
ratings/notes/tags — not cached posters/covers, which are cheap to
re-fetch on a metadata refresh (aside from a manually-uploaded custom
cover, a smaller edge case). Each backup uses SQLite's own online backup
mechanism rather than a plain file copy, so it's always a complete,
consistent snapshot regardless of what's been checkpointed to disk yet —
in particular, a raw copy of just `library.db` while the app is running in
WAL mode can miss recent writes still sitting in `library.db-wal`; this
doesn't have that problem.

**Set `BACKUP_DIR`/`BACKUP_SYNC_PATH` to somewhere genuinely independent of
`./data`** — a different share, a different disk, anywhere that wouldn't be
affected by the exact scenario described in **Data & persistence** above.
A backup that lives inside the same managed folder as the database it's
backing up doesn't protect against that folder itself being reset. Backups
are downloadable from the Settings page too, so you can pull a copy
somewhere off this host entirely (a genuine off-site copy) whenever you like.

To restore from a backup: stop the container, replace `library.db` (and
delete any `library.db-wal`/`library.db-shm` sitting next to it) in your
data folder with the backup file, then start the container again. There's
no one-click restore in the app itself — restoring is a deliberate,
infrequent action, and doing it by hand avoids needing to trust an
in-app "overwrite my current database" button.

## Local development (without Docker)

```bash
# terminal 1 — API server
cd server
npm install
TMDB_API_KEY=your_key DATA_DIR=./data MOVIES_DIR=/path/to/movies AUDIOBOOKS_DIR=/path/to/audiobooks EBOOKS_DIR=/path/to/ebooks ALBUMS_DIR=/path/to/albums node index.js

# terminal 2 — frontend dev server (proxies /api to :8080)
cd client
npm install
npm run dev
```

Then open http://localhost:5173.
