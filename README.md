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

2. **Edit `docker-compose.yml`**: change the line

   ```yaml
   - "//SERVER/Movies:/movies:ro"
   ```

   to point at the real folder where your movie files are. See
   **Network drives on Windows** below for the exact syntax if your movies
   live on a network share — it's not just a drive letter. You can add more
   `- "//SERVER/OtherShare:/movies/other:ro"` lines if movies are split
   across multiple shares/folders.

3. **Set your API key**, either:
   - copy `.env.example` to `.env` and fill in `TMDB_API_KEY=...`, or
   - leave it blank and paste the key into the app's Settings page after it's
     running.

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

1. Make sure you've pushed your real movie-share path in `docker-compose.yml`
   (see **Network drives on Windows** below) and that the GHCR image is
   public (see **Image publishing** above).

2. In Portainer: **Stacks → Add stack**.
   - Name it (e.g. `movie-cataloger`).
   - Build method: **Web editor**.
   - Paste the full contents of this repo's `docker-compose.yml`.

3. Under **Environment variables**, add:
   - `TMDB_API_KEY` = your TMDB key (or leave it blank and paste it into the
     app's Settings page after it's running).

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

## Network drives on Windows (Docker Desktop + WSL2)

If your movies live on a NAS or network share rather than a local disk,
**don't** use a mapped drive letter (`Z:\Movies`) in `docker-compose.yml` —
mapped drives are tied to your Windows login session, and Docker Desktop's
background service frequently can't see them, so the container fails to
find the folder.

Instead:

1. **Make sure Windows itself already trusts the share.** Open it once in
   File Explorer (`\\SERVER\Movies`) and enter credentials if prompted, or run
   once from PowerShell so it's cached:

   ```powershell
   net use \\SERVER\Movies /persistent:yes
   ```

2. **Reference the UNC path with forward slashes** in `docker-compose.yml`
   (Docker Desktop's Windows path translation expects this form, not
   backslashes):

   ```yaml
   volumes:
     - ./data:/data
     - "//SERVER/Movies:/movies:ro"
   ```

   Replace `SERVER` with the NAS's hostname or IP (an IP is more reliable
   than a hostname if you don't have local DNS set up), and `Movies` with the
   actual share name.

3. Run `docker compose up -d --build` from a normal Windows terminal
   (PowerShell/CMD) — not from inside a WSL Linux shell — so Docker Desktop
   handles the UNC-to-container translation itself.

If the mount still fails, check `docker compose logs movie-cataloger` and
`docker inspect movie-cataloger` for a mount error — it's almost always a
permissions/credentials issue with the share rather than the app.

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
