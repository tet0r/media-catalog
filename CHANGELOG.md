# Changelog

Versioning here isn't strict semver — a **major** bump (v*X*.0) marks a
genuinely new capability; a **minor** bump (v*X*.*Y*) marks a fix, tweak, or
smaller enhancement to something that already existed. Docs-only commits
aren't versioned separately.

## v4.3 — Fix the update notice missing recent pushes
- The GitHub version check was cached for a full hour, and the frontend
  only ever checked once on page load — so a push could go unnoticed for
  up to an hour even with the tab open and freshly reloaded. Cache dropped
  to 5 minutes; the frontend now re-checks every 5 minutes while the tab
  stays open, instead of only on initial mount.

## v4.2 — Remove movies whose file is gone
- New Settings toggle: during any scan (manual or automatic), delete movies
  whose backing file no longer exists. Guarded against a network mount
  briefly failing: a share that returns zero files that scan is treated as
  unhealthy and its movies are left untouched, never removed.

## v4.1 — Update available notice
- The nav bar's version tag now shows an "Update available" badge when the
  `VERSION` file on GitHub's `main` branch is ahead of the running instance
  — checks hourly, fails silently if GitHub is unreachable.

## v4.0 — Automatic library scanning
- Settings toggle + interval picker for periodically re-scanning movie
  folders and auto-adding new matches, without needing to click "Scan Now"
  manually. Polls on a timer rather than watching for filesystem events,
  since real-time watching isn't reliable over network/SMB shares.

## v3.2 — Accept imdb.com URLs in the URL-lookup fallback
- The "paste a URL" fallback (Add Movie, Scan Library review) now resolves
  imdb.com/title/... URLs too, via TMDB's own find-by-external-ID endpoint.

## v3.1 — Detect a broken ThePosterDB scraper
- A poster search returning zero results now runs a canary check against a
  title known to reliably have results; if that's also empty, shows a
  distinct warning instead of implying the movie itself has no posters.

## v3.0 — Pick alternate posters and banners
- Click a movie's poster to search ThePosterDB for alternates; click the
  banner to browse TMDB's own backdrop gallery. Picking one downloads and
  caches it locally.

## v2.0 — Fix a stuck review item without leaving the page
- Scan Library's "Needs Review" items gained an editable title/year search
  box and a "paste a themoviedb.org URL" fallback, so a bad guess or a
  title search miss can be corrected in place instead of requiring a
  separate manual add.

## v1.5 — Looser auto-match comparison
- Auto-matching during a scan now tolerates common title differences
  (sort-friendly "Title, The" naming, colons, dashes, "vs."/"vs") instead
  of requiring an exact string match, so more scanned files land as
  confirmed matches instead of Needs Review.

## v1.4 — Keep folder names out of the committed compose file
- Share sub-paths moved from `docker-compose.yml` into environment
  variables, so the file stays generic even though the repo is public.

## v1.3 — Fix network shares not being read at all
- Plain UNC bind-mounts and mapped drive letters are unreliable on Docker
  Desktop's WSL2 backend (mounts silently empty, no error). Switched to
  CIFS-driver-backed named volumes, which mount the SMB share directly via
  the Linux VM's own CIFS client.

## v1.2 — Fix multi-share scanning
- The scanner only ever walked a single `MOVIES_DIR`, so `/movies2`,
  `/movies3` etc. were mounted but never scanned. `MOVIES_DIR` now accepts
  a comma-separated list.

## v1.1 — Publish images to GHCR
- Added a GitHub Actions workflow to build and push the image on every
  push to `main`, so the app can be deployed via Portainer's Web Editor
  (which needs a pre-built image) as well as its Repository method.

## v1.0 — Initial release
- Express + SQLite backend, React frontend, TMDB metadata lookup, and a
  library-folder scanner that matches video files against TMDB by
  filename/folder naming — the first working version of the self-hosted
  movie cataloger.
