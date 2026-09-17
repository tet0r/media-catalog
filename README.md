# Movie Cataloger (self-hosted CLZ Movies alternative)

A self-hosted, Docker-deployable movie collection cataloger, inspired by
[CLZ Movies](https://clz.com/movies): a personal database of your movies with
posters, cast/crew, plot, ratings, plus your own fields (format, shelf
location, purchase info, personal rating, notes, loan tracking).

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

## Setup

1. **Get a free TMDB API key**: sign up at themoviedb.org, then go to
   [Settings → API](https://www.themoviedb.org/settings/api) and request a
   free "Developer" API key (approved instantly for personal use).

2. **Point it at your movie folders.** If they're on local disk, just bind
   mount them directly (`- /path/to/movies:/movies:ro`) and add `/movies` to
   the `MOVIES_DIR` env var. **If they're on a network share (NAS, another
   PC), see Network shares below first** — plain bind-mounting a network
   path is unreliable on Docker Desktop and needs a different setup.

   If your library is split across multiple shares/folders, give each one
   its own mount point (`/movies`, `/movies2`, `/movies3`, ...) **and** add
   it to the `MOVIES_DIR` environment variable — the scanner only looks at
   paths listed there, so a volume mounted but left out of `MOVIES_DIR`
   will silently never get scanned.

3. **Set your API key and (if using network shares) SMB details**: copy
   `.env.example` to `.env` and fill it in — or leave `TMDB_API_KEY` blank
   and paste it into the app's Settings page after it's running.

4. **Pull and run:**

   ```bash
   docker compose up -d
   ```

   (This pulls the pre-built image from GHCR — see **Image publishing**
   below. If you want to build from source instead, run
   `docker build -t ghcr.io/tet0r/movie-cataloger:latest .` first.)

5. Open **http://localhost:8080** (or `http://<your-server-ip>:8080` from
   another device on your network).

6. Go to **Scan Library** to import movies from your files, or **Add Movie**
   to search TMDB by title and add manually.

## Image publishing

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds
this repo's `Dockerfile` and pushes it to **GitHub Container Registry**
(`ghcr.io/tet0r/movie-cataloger:latest`) on every push to `main`. This is
what lets `docker-compose.yml` just say `image: ghcr.io/...` instead of
`build: .` — no build step needed on the machine that runs the container.

**One-time step after the first push**: GitHub publishes new packages as
*private* by default, so Portainer (or `docker pull`) won't be able to fetch
it until you make it public:

1. Go to your GitHub profile → **Packages** tab (or
   `https://github.com/users/tet0r/packages/container/package/movie-cataloger`).
2. Open **Package settings** → **Change visibility** → **Public**.

(Alternatively, keep it private and give Portainer a GHCR credential under
**Registries** — but public is simplest for a hobby project with no secrets
baked into the image.)

Check the **Actions** tab on the GitHub repo to confirm the build succeeded
before deploying — the image won't exist yet until that workflow run
finishes.

## Deploying via Portainer (Web editor)

Since the image is published to GHCR, you can just paste the compose file
directly into Portainer — no repo access from the Docker host needed.

1. Confirm the GHCR image is public (see **Image publishing** above). The
   compose file itself needs no editing for this — your share paths aren't
   in it (see **Network shares** below).

2. In Portainer: **Stacks → Add stack**.
   - Name it (e.g. `movie-cataloger`).
   - Build method: **Web editor**.
   - Paste the full contents of this repo's `docker-compose.yml` as-is.

3. Under **Environment variables**, add (Portainer's stack env vars, not a
   local `.env` file, are what fill in the `${...}` references when
   deployed this way):
   - `TMDB_API_KEY` = your TMDB key (or leave it blank and paste it into the
     app's Settings page after it's running)
   - `SMB_HOST` = the IP address of the PC hosting your movie shares
   - `SMB_USER` / `SMB_PASS` = credentials for that share
   - `SMB_SHARE1` / `SMB_SHARE2` / `SMB_SHARE3` = each share's sub-path,
     e.g. `movies/Movies`

4. Click **Deploy the stack**. Portainer pulls
   `ghcr.io/tet0r/movie-cataloger:latest` and starts the container — no
   source clone or build on the Docker host.

5. To ship a later change, push to `main` (which re-triggers the GitHub
   Actions build), then in Portainer open the stack and click
   **Pull and redeploy** so it grabs the new `:latest` image.

   (If you'd rather have Portainer build from source itself instead of
   pulling a registry image, use **Stacks → Add stack → Repository**
   pointed at `https://github.com/tet0r/movie-cataloger.git` with a
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
itself — they're all environment variables (`SMB_HOST`, `SMB_SHARE1/2/3`),
so this file stays generic even if the repo is public. Your real values go
in `.env`, which is gitignored, or in Portainer's stack environment
variables (which aren't part of the compose file either).

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
   - `SMB_SHARE1` / `SMB_SHARE2` / `SMB_SHARE3` — each share's sub-path
     relative to `//SMB_HOST/`, e.g. `movies/Movies`.
2. `docker compose up -d` (or redeploy the Portainer stack, with those same
   variables set under its Environment variables instead of `.env`). Docker
   creates the named volumes by mounting each CIFS share the first time
   they're used.

**If it still doesn't work**, check `docker compose logs movie-cataloger`
and `docker volume inspect movie-cataloger_movies1` — a CIFS mount failure
(bad credentials, unreachable host, wrong share path) shows up there as an
actual error, unlike the plain-bind-mount case which fails silently. Note
that `password=` in the `o:` option breaks if your password contains a
comma (the option string is comma-delimited) — change the password if so.

## Data & persistence

Everything (the SQLite database and cached poster images) lives under
`./data` next to `docker-compose.yml`, via the `/data` volume. Back that
folder up if you want to preserve your collection.

## Local development (without Docker)

```bash
# terminal 1 — API server
cd server
npm install
TMDB_API_KEY=your_key DATA_DIR=./data MOVIES_DIR=/path/to/movies node index.js

# terminal 2 — frontend dev server (proxies /api to :8080)
cd client
npm install
npm run dev
```

Then open http://localhost:5173.
