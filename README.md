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

4. **Build and run:**

   ```bash
   docker compose up -d --build
   ```

5. Open **http://localhost:8080** (or `http://<your-server-ip>:8080` from
   another device on your network).

6. Go to **Scan Library** to import movies from your files, or **Add Movie**
   to search TMDB by title and add manually.

## Deploying via Portainer

This repo can be deployed as a Portainer **stack** built straight from Git,
so Portainer does the `git clone` + `docker compose build` for you — no
container registry required.

1. **Push this repo to GitHub** (or any Git host your Docker/Portainer host
   can reach):

   ```bash
   git remote add origin https://github.com/<you>/movie-cataloger.git
   git push -u origin master
   ```

2. In Portainer: **Stacks → Add stack → Repository**.
   - **Repository URL**: `https://github.com/<you>/movie-cataloger.git`
   - **Reference**: `refs/heads/master` (or `main`, whatever you pushed as)
   - **Compose path**: `docker-compose.yml` (default — already correct)
   - Leave **Build method** on the default; Portainer builds the image from
     the `Dockerfile` in the cloned repo automatically.

3. Before/while adding the stack, set the environment variable Portainer
   asks for:
   - `TMDB_API_KEY` = your TMDB key (or leave it blank and paste it into the
     app's Settings page after it's running).

4. Still edit the `volumes:` line in `docker-compose.yml` for your movie
   share path (see **Network drives on Windows** below) *before* you push —
   Portainer deploys whatever is committed to the repo, it doesn't prompt you
   for volume paths in the UI.

5. Click **Deploy the stack**. Portainer clones the repo onto the Docker
   host and brings the container up, same as running `docker compose up
   -d --build` yourself.

6. To ship a later change (e.g. a different movie folder path), commit and
   push it, then in Portainer open the stack and click **Pull and redeploy**
   — or turn on the stack's **GitOps updates** option if you want it to
   redeploy automatically whenever you push.

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
