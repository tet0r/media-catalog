# Changelog

Versioning here isn't strict semver — a **major** bump (v*X*.0) marks a
genuinely new capability; a **minor** bump (v*X*.*Y*) marks a fix, tweak, or
smaller enhancement to something that already existed. Docs-only commits
aren't versioned separately.

## v6.0 — Renamed the project to Media Catalogue
- Renamed everything: the GitHub repo (`movie-cataloger` → `media-catalog`),
  the GHCR image path, both `package.json` names, the browser tab title,
  and the in-app brand text ("🎬 Movie Cataloger" → "🎬 Media Catalogue").
  **Breaking for existing deployments**: the GHCR image now publishes to
  `ghcr.io/tet0r/media-catalog` instead of `ghcr.io/tet0r/movie-cataloger`
  — an existing `docker-compose.yml` or Portainer stack pointed at the old
  path keeps working but stops receiving new builds, so update it to the
  new image path (see README) to keep getting updates. Historical
  CHANGELOG entries below are left as originally written rather than
  rewritten for the new name.
- Also centered the search/view/sort controls in the top bar (previously
  left-aligned after being moved there in v5.6).

## v5.6 — Persistent search/view/sort in the top bar, media favicon
- Search, the rating "View" filter, and the sort menu moved from the top of
  the movie grid into the sticky top bar, so they stay visible and usable
  while scrolling through a long collection instead of scrolling away with
  the grid. They now only show up on the Library page.
- Added a clapperboard favicon (`client/public/favicon.svg`) instead of
  the browser's default blank-page icon.

## v5.5 — Filter Library by content rating instead of format
- Replaced the Library's "All formats" dropdown with a "View" dropdown
  filtered by content rating (G, PG, PG-13, R, NC-17, NR) instead of media
  format, which wasn't a very useful way to browse a folder-scanned
  collection. "NR" also catches movies with no US certification at all,
  not just an explicit "Not Rated".
- Movies didn't have a content rating in their metadata before this — it's
  now pulled from TMDB's US release-date certification alongside the rest
  of a movie's details, and shown on the movie detail page next to runtime
  and the TMDB score. Existing movies need a metadata refresh (per-movie or
  the bulk one in Settings) to pick it up, same as other fields added in
  past versions.

## v5.4 — Tabbed poster picker with upload, readable A-Z index
- The A-Z jump index on the Library page was hard to read (tiny letters
  with no visual separation from the page). It's now larger, in a
  pill-shaped panel with a hover highlight, so it's easier to scan and hit.
- The poster picker now has two tabs — ThePosterDB and TMDB — instead of
  only searching ThePosterDB, so a TMDB-only or better-covered title isn't
  stuck with no alternatives.
- Added an "Upload Image..." button to the poster picker for using a local
  file instead of anything from either source. Uploads go straight to the
  server as raw image bytes (no new dependency needed for it).

## v5.3 — Cast photos, 3-line card titles, drop file path from movie page
- Cast members on a movie's detail page now show their photo from TMDB (when
  one exists) instead of just a name/character line. Existing movies need a
  "Refresh Metadata" (or the bulk one in Settings) to pick up photos, since
  the cast data was fetched before this field existed.
- Library card titles now clamp to 3 lines instead of 2, so more of a long
  title is visible before it's cut off (still a fixed height, so cards stay
  uniform either way).
- The movie detail page no longer shows the on-disk file path — it was
  clutter for a folder-scanned collection, not information a user needs day
  to day.

## v5.2 — Uniform Library card heights
- Titles were wrapping to different numbers of lines depending on length,
  making grid rows uneven. Card titles now clamp to a fixed 2-line height
  regardless of title length, so every card in the grid is exactly the
  same height. Also dropped the format/media-type text (e.g. "File") from
  the card, per request.

## v5.1 — Bulk metadata refresh from Settings
- "Refresh All Metadata" in Settings runs the same per-movie TMDB refresh
  from v5.0 across the whole collection as a background job, with live
  progress. Skips movies with no TMDB match, keeps going past a failure on
  any one movie rather than stopping the whole batch, and leaves posters/
  backdrops untouched.

## v5.0 — Replace "My Collection Info" with richer movie details
- Dropped the entire personal-collection form (format, location, purchase
  date/price/store, my rating, watched, loaned-to, notes) from the movie
  detail page — not deleted from the database, just no longer shown or
  editable there.
- In its place: tagline, original title, full cast with character names,
  crew (writer/producer/composer/etc., grouped by job), production
  companies, spoken languages, budget/revenue, vote count, status (if not
  "Released"), and IMDb/TMDB/homepage links.
- New "Refresh Metadata" button re-fetches from TMDB for a movie already in
  the collection, so existing entries can pick up these new fields without
  being deleted and re-added. Leaves poster/backdrop alone, in case a
  custom one was picked via ThePosterDB/TMDB's gallery.
- `movies` table gained tagline/crew/vote_count/imdb_id/budget/revenue/
  status/original_language/homepage/production_companies/spoken_languages
  columns, with a migration for existing databases.
- Going into a movie and back now also keeps whatever sort field and
  direction you had set, using the same module-level persistence as the
  scroll-position restoration from v4.5 (component state alone doesn't
  survive Library unmounting when you navigate to a movie route).

## v4.6 — Reversible sort menu
- Replaced the Library sort dropdown (Title/Year/Recently Added/My
  Rating/TMDB Rating) with a 4-option menu — A-Z, Year, Length, Rating
  (personal rating) — where clicking the already-active option reverses
  its direction instead of doing nothing. A native `<select>` can't do
  this (re-picking the same option fires no change event), so it's a
  small custom dropdown instead. Backend gained `runtime` as a sortable
  column.

## v4.5 — Restore Library scroll position on return
- Going into a movie's detail page and back no longer resets the Library
  to the top. Scroll position is tracked continuously while the page is
  open (not captured on unmount, which was too late — the browser had
  already clamped it to fit the next, usually shorter, page) and restored
  once when the page remounts.

## v4.4 — A-Z jump index on the Library page
- A full-height letter index (# and A-Z) on the right edge of the Library
  page. Letters with no matching titles are disabled. Clicking one scrolls
  to the first movie starting with it, switching sort to Title first if it
  wasn't already (then jumping once the re-sorted list has loaded).

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
