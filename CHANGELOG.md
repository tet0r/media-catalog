# Changelog

Versioning here isn't strict semver — a **major** bump (v*X*.0) marks a
genuinely new capability; a **minor** bump (v*X*.*Y*) marks a fix, tweak, or
smaller enhancement to something that already existed. Docs-only commits
aren't versioned separately.

## v15.7 — "Search Again" for Movies, TV Shows, Audiobooks, and Ebooks
- Albums already let you re-point an item at a different catalog entry
  without deleting and re-adding it (for when the original scan matched
  the wrong thing). That's now available from every scanned media
  type's detail page: Movies (TMDB), TV Shows (TheTVDB), Audiobooks
  (Audible or Apple Books), and Ebooks (Open Library).
- "Search Again" is distinct from "Refresh Metadata": Refresh re-fetches
  the *same* match and leaves the cover/poster alone (so a manually
  picked image isn't clobbered); Search Again points the item at a
  genuinely different match and replaces the cover/poster too, since
  it's now a different item's identity. Either way, the file on disk
  (`file_path`/`file_parts`) is untouched.
- Built as one reusable `SearchAgain` component instead of copy-pasting
  Albums' inline version four more times.
- Games and Vinyl don't get this: both are sync-mirrors of a single
  source of truth (your LaunchBox library / your own Discogs
  collection) rather than a scan matched against a searchable catalog,
  so there's no "different candidate" for either of them to search for.
- Verified live: rematching worked end-to-end for Ebooks, TV Shows, and
  Audiobooks (including switching source from Audible to Apple Books
  mid-rematch), preserving each item's file path throughout. Movies
  wasn't tested against the real TMDB API (no API key available while
  testing) but uses the same pattern already proven for TV Shows.

## v15.6 — Fix scans/syncs getting stuck "running" forever
- A scan/sync/backup always resets its own `running` flag back to 0 when
  it finishes, whether it succeeds or fails — but that code never runs
  if the process itself dies mid-operation (a crash, an unclean
  container restart, ...), leaving the button permanently disabled and
  the status message stuck (e.g. Games showing "Reading your LaunchBox
  library..." forever, with `running: 1` and `last_run: null`).
- db.js now resets every scan/sync/backup status table's `running` flag
  to 0 on every startup — a row still showing `running=1` at that point
  is always stale, since nothing from a previous process (including its
  database connection) survives a restart anyway. Covers every media
  type's scan/sync status and Backups, not just Games.
- Verified: seeded a stuck `running=1` row, confirmed a fresh process
  start resets it (with a clear "Interrupted by a restart" message) and
  that a normal, non-stuck status table is left untouched.

## v15.5 — Music nests as a collapsible dropdown in the sidebar
- Albums/Vinyl under Music in the left sidebar now collapse behind the
  "Music" header instead of always being visible — click it to
  expand/collapse (▸/▾ chevron indicates state). A group containing the
  page you're currently on always shows expanded regardless of the
  manual toggle, so navigating into Albums/Vinyl never hides the link
  you just used.
- Verified live: starts collapsed on an unrelated page, expands on
  click, and correctly shows Albums/Vinyl highlighted when landing on
  either directly.

## v15.4 — Tabbed Settings instead of one long scrolling page
- Settings is now tabbed: General (Sidebar + Backups — anything not tied
  to one media type) plus one tab per media type (Movies, Audiobooks,
  Ebooks, Albums, Vinyl, Games, TV Shows), instead of every section
  stacked in one long scroll. Reuses the same `.picker-tabs` styling
  already used for Needs Review/Ignored elsewhere in the app.
- Always opens on General — Settings unmounts when you navigate away
  (it's its own route) and remounts fresh each time you come back, so
  that's just the tab state's initial value, no extra logic needed.
- Save stays a single persistent action below the tabs regardless of
  which one is showing — it still saves everything at once, same as
  before; only the *display* is now split into tabs, not the save
  behavior.
- Verified live: each tab shows only its own section, switching between
  them works, and Save/error/status messages remain visible at the
  bottom regardless of the active tab.

## v15.3 — Fix backups failing when BACKUP_DIR is a network share
- `Backup failed: ENOENT: no such file or directory, stat '/backups/library-....db'`
  when `BACKUP_DIR` is a CIFS/SMB share (exactly the kind of location the
  README recommends pointing it at). SQLite's online backup API opens its
  *destination* as a real database too, subject to the same file-locking
  primitives as any other — network filesystems are notoriously unreliable
  at supporting those, which is why SQLite's own docs warn against putting
  a database on one at all.
- lib/backup.js now always does the actual SQLite-level backup on local,
  reliable storage first (a scratch file next to the live database,
  cleaned up afterward), then copies the finished, already-closed file
  onto `BACKUP_DIR` with an ordinary byte copy — which needs none of
  SQLite's locking, so a network share is fine for that part even though
  it isn't for the SQLite-level part.
- Verified against a local filesystem (can't reproduce the real CIFS
  failure directly, but confirmed the refactor doesn't change behavior
  there): backup completes, correct size, scratch file cleaned up after.

## v15.2 — One-click Restore for backups
- Each backup in Settings now has a Restore button — no more manually
  swapping files on the Docker host. Confirms first (this replaces your
  current collection with whatever's in that backup), then automatically
  takes a safety snapshot of the current state before restoring, so
  restoring the wrong one by mistake is itself recoverable.
- Restoring closes the app's database connection and exits the process —
  there's no cheap way to hot-swap the dozens of modules that each hold
  their own `require('../db')` reference to the live connection, so this
  leans on the platform's restart policy (`restart: unless-stopped`,
  already the compose file's default) to bring it back up fresh against
  the restored file. The Settings page polls for it to come back and
  reloads automatically; if it's not running under a restart policy,
  you'd need to start it again by hand (documented in the README).
- The risky I/O (copying the backup into place) happens *before* the
  live connection is closed, and the final swap is an atomic rename —
  if the copy fails, the running app hasn't been touched at all and the
  error is still reportable normally.
- Verified: a two-process test (since restoring necessarily ends the
  process making the request) confirmed a changed value was correctly
  reverted after restore+restart, that the automatic pre-restore safety
  snapshot appeared in the backup list, and that the app came back up
  healthy. Also verified live in the browser: clicking Restore shows a
  "Restarting..." message, and the page auto-reloads once the restarted
  server responds again.

## v15.1 — Click a Needs Review thumbnail to enlarge it
- Every media type's Needs Review candidate list (Movies, Audiobooks,
  Ebooks, Albums, TV) now lets you click a candidate's small poster/cover
  thumbnail to see it full-size in an overlay — useful when two
  candidates' thumbnails look too similar/small to tell apart. Click
  anywhere else to dismiss it; clicking the enlarged image itself doesn't
  close it. New shared components/ZoomableImage.jsx, used directly by
  four of the five pending-item components and folded into
  components/CoverImage.jsx for Albums (which also picks up the same
  behavior in Add Album and AlbumDetail's "Search Again", both already
  built on CoverImage).
- The enlarged image renders via a React portal straight to
  `document.body` rather than in place — several ancestors (`.candidate`,
  `.poster`, `.cast-member`, ...) already have their own `img { width:
  ...; height: ... }` rules sized for a small thumbnail, which would
  otherwise have clamped the enlarged copy down to thumbnail size too as
  a DOM descendant of the same container.
- Verified live: enlarging a candidate thumbnail on Movies' Needs Review
  page renders it full-size; clicking elsewhere dismisses it; clicking
  the enlarged image itself does not.

## v15.0 — Scheduled and manual database backups
- New Backups section in Settings: a manual "Back Up Now" button and an
  optional schedule (every 6/12 hours, daily, every 3 days, or weekly),
  with a configurable retention count that prunes the oldest backups
  (manual and automatic together) after each new one. Backups are listed
  with size/date, downloadable individually, and deletable.
- Only the database is backed up, not cached posters/covers (cheap to
  re-fetch on a metadata refresh) — lib/backup.js uses better-sqlite3's
  own online backup API rather than a plain file copy, since a raw copy
  of `library.db` alone can miss recent writes still sitting in
  `library.db-wal` under WAL mode.
- New `BACKUP_DIR`/`BACKUP_SYNC_PATH` env vars (mirroring the
  `LAUNCHBOX_DIR`/`LAUNCHBOX_SYNC_PATH` pattern) — deliberately a
  *separate* mount from `./data`, since the whole point is surviving a
  scenario where `./data` itself gets reset. README's "Data & persistence"
  section now documents that scenario directly: a Portainer stack update
  can cause Compose to recreate a relative bind-mount path like `./data`
  from scratch, silently abandoning the old (populated) folder — this
  isn't hypothetical, it's a real failure mode this project hit.
- Restoring is documented as a manual process (stop the container, swap
  in the backup file, restart) rather than a one-click in-app action,
  deliberately — a destructive "overwrite the live database" button is a
  bigger risk than the inconvenience of doing it by hand.
- Verified: manual backup creation, listing, download (content-length
  matches file size), deletion, and path-traversal safety on the
  filename parameter all confirmed directly against a running server;
  the Settings UI confirmed live (backup created and listed correctly,
  settings persistence round-tripped).

## v14.0 — Notifications, sidebar fixes
- New notification bell in the top bar (next to the nav links, on every
  page): every item added to any media type — a scan/sync auto-match or a
  manual Add — shows up here, newest first, each one linking straight to
  that item's detail page. Clear one individually or Clear All; capped at
  the 300 most recent so a long-running install with frequent auto-scans
  doesn't grow this forever. Polls every 10s so the badge updates without
  needing to reload the page.
- Settings has a new "Sidebar" section at the top with a toggle per media
  type (Movies, Audiobooks, Ebooks, Albums, Vinyl, Games, TV Shows) to
  show or hide it in the left sidebar — the "Music" group itself
  disappears automatically if both Albums and Vinyl are hidden.
- Fixed: Music was out of alphabetical order in the sidebar (sorted first
  instead of between Movies and TV Shows).
- Clicking "Media Catalog" in the top bar now takes you back to whichever
  media type you were last actually on, instead of doing nothing — stays
  put through a trip to Settings rather than resetting.
- Verified live: a real Games sync generated one notification per newly
  added game (936 in this case, correctly trimmed to the 300 cap);
  clicking a notification opened the right item's detail page; per-item
  clear and Clear All both confirmed; the sidebar toggle for TV Shows
  hid/restored it live without a page reload; the brand link correctly
  carried "last section" across a visit to Settings.

## v13.2 — TV scan now actually auto-matches shows
- The scan's auto-match required a year parsed from the show's *folder
  name* before it would ever add anything automatically — copied directly
  from Movies' scan logic, where that makes sense because "Title (Year)"
  is the standard movie-folder convention. TV shows are almost never
  named that way (just "Cheers", not "Cheers (1982)"), so that gate was
  nearly unreachable — a first scan landed almost everything in Needs
  Review regardless of how good the match was.
- routes/tvScan.js now auto-matches on an unambiguous title match alone;
  a folder-guessed year (when present) is only used to break a tie when
  more than one candidate shares that exact title (e.g. a US/UK remake
  pair) — never as a requirement.
- Verified live: two year-less fixture folders ("Cheers", "Naruto") both
  auto-matched on this scan logic where they previously would have
  landed in Needs Review every time.

## v13.1 — TV search/add now prefers English titles (anime, etc.)
- TheTVDB's `name`/`overview` fields are the show's *primary*-language
  text, which for anime and other non-English-native shows is the native
  title — e.g. a Naruto search came back as "NARUTO－ナルト－", not
  "Naruto". lib/tvdb.js now prefers the English translation everywhere:
  search results carry every language inline already (free, no extra
  request), while a series' full details need one extra call to
  TheTVDB's per-language translations endpoint (skipped entirely for a
  show with no English translation at all, rather than requesting one
  and getting nothing back).
- This wasn't just cosmetic — a scan's exact-match step compares the
  guessed folder name against the search result's title, so a folder
  named the normal English way (e.g. `Naruto/`) would never have matched
  a candidate titled "NARUTO－ナルト－" and would always land in Needs
  Review instead of auto-matching.
- Verified live: searching/adding "Naruto" now returns "Naruto" (English
  title + overview) instead of the native Japanese text.

## v13.0 — TV Shows, via TheTVDB
- New "TV Shows" media type, built the same way as Movies: point it at a
  folder, scan, matches get added automatically, uncertain ones land in
  Needs Review, `Add Show`/manual search, `Refresh Metadata`, bulk refresh,
  Clear Library — same personal-collection fields too (format, location,
  purchase info, personal rating, notes, loaned-to, watched, tags).
- The one deliberate difference from Movies: **a show is identified by its
  own top-level folder only.** lib/tvScanner.js never looks inside season
  subfolders to decide what a show is — `TV/Cheers/Season 1/...` is never
  scanned as anything separate from `TV/Cheers` itself, so a show with any
  number of seasons/episodes underneath is still exactly one item. A
  folder only counts if it (at any depth) contains an actual video file.
- Metadata source is TheTVDB (lib/tvdb.js) rather than TMDB — its v4 API
  needs a short-lived login exchange (API key [+ subscriber PIN if your key
  is that kind] → a bearer token good for about a month) rather than a bare
  key per request, handled transparently with automatic re-login on
  expiry. Free for personal/non-commercial use with attribution (which
  this README now includes) — see thetvdb.com/api-information.
- Poster comes from TheTVDB's own resolved series image; a "Choose a
  Poster" picker offers every poster-type artwork TheTVDB has for that
  show, and a backdrop is picked from its background-type artwork — both
  artwork *type IDs* are discovered from the live `/artwork/types`
  endpoint and cached, not hardcoded, since TheTVDB doesn't document them.
- `Add Show`/Needs Review's URL-paste fallback accepts a thetvdb.com series
  URL (plain slug or short `/dereferrer/` link) or an imdb.com URL,
  resolved via TheTVDB's own remote-id search the same way Movies resolves
  an IMDb URL through TMDB's `/find` endpoint.
- Verified: server boots clean with the new routes/tables; lib/tvScanner.js
  confirmed against real fixture folders to find exactly the top-level show
  folders (and only those — season subfolders and a folder with no video
  files were both correctly excluded); the "no API key configured" path
  fails a scan cleanly with a clear message, matching the other media
  types' behavior. Also verified end-to-end against TheTVDB's real live
  API with a real account's key: search, add, poster-gallery/backdrop
  artwork-type discovery, thetvdb.com/imdb.com URL lookup, metadata
  refresh, and a full folder scan (auto-match skipped for a year-less
  folder name exactly like Movies would, landing correctly in Needs
  Review with real candidates; skip/ignore both confirmed too).

## v12.2 — Games now backfills covers for already-synced games too
- Metadata (title, platform, developer, genres, ...) already refreshed on
  every sync for games already in the collection, but cover_file was only
  ever set on first insert — a game synced before v12.1's cover-matching
  fix (or before LaunchBox had art for it at all) would never pick up a
  cover on a later sync, even though it now exists. lib/gamesSync.js now
  backfills cover_file on every sync whenever it's currently empty, while
  still never overwriting one that's already set — whether that's a cover
  it auto-fetched earlier or one you uploaded manually.
- Verified end-to-end: force-nulled every cover on a synced 936-game
  library (simulating "already synced before the v12.1 fix"), planted a
  fake manual cover on one game, re-ran sync, and confirmed all 935 empty
  covers were backfilled while the manual one was written back unchanged.

## v12.1 — Games now finds nearly every cover LaunchBox itself shows
- v12.0's cover lookup only checked "Box - Front", which is empty for most
  digital (Steam/GOG/Epic/...) titles — LaunchBox's own UI instead falls
  back through an ordered list of image types (store poster art first,
  physical box art after), recorded per-install in Data/Settings.xml as
  `FrontImageTypePriorities`. lib/launchboxLibrary.js now reads and walks
  that same list (falling back to LaunchBox's documented default order if
  the setting's missing), so covers now match what you actually see inside
  LaunchBox instead of just physical box scans.
- Also switched the filename match itself from a fixed set of substituted
  characters to comparing both sides with all punctuation stripped —
  LaunchBox's own cached filenames turned out to be inconsistent about it
  (a straight apostrophe in one game's title became `_`, "Mirror's Edge" →
  "Mirror_s Edge", but showed up as a curly `'` in another's filename
  outright), so no fixed substitution rule covers every case.
- Verified against the same real 936-game LaunchBox install used to build
  this feature: cover match rate went from 21% (196/936, all from Box -
  Front alone) to 100% (936/936).

## v12.0 — Games, mirrored from a local LaunchBox installation
- New "Games" media type. Unlike every scanned media type, it isn't matched
  against a public catalog at all — LaunchBox (launchbox-app.com) has no
  public search API and no documented scraping-free path to one, but its
  desktop app already downloads per-platform game metadata and box art as
  plain XML/image files for offline use once you've imported/identified
  your games there. This just reads those files directly (lib/
  launchboxLibrary.js), mirroring the whole approach Vinyl already
  established for Discogs: a direct sync/mirror, no Needs Review/Ignored,
  LaunchBox stays the source of truth.
- Since LaunchBox normally runs on a different PC than this server, there's
  no live network-share mount for it — instead you keep a synced copy of
  just its `Data` and `Images` folders on the Docker host (`LAUNCHBOX_DIR`
  env var, `LAUNCHBOX_SYNC_PATH` in `.env`) via whatever sync tool you like
  (robocopy/rsync/Syncthing/...). See the README's new **Games** section.
- Games page mirrors Vinyl's: a "Sync from LaunchBox" button (plus optional
  auto-sync in Settings), grid view groupable by platform, a detail page
  showing developer/publisher/genre/rating/overview, and a manual cover
  upload if you want to override LaunchBox's box art.
- Verified against a real local LaunchBox install (936 games across 9
  platforms): parsed metadata correctly (including numeric/hex XML entity
  decoding), matched and cached box art for every title whose filename
  needed Windows-invalid-character sanitization first (e.g. "Anno 1701:
  History Edition" → "Anno 1701_ History Edition-01.jpg" on disk — missed
  entirely before accounting for this), and confirmed a full sync via a
  realistic server-boot + HTTP test end-to-end with no errors.

## v11.5 — Removing an album now ignores its folder(s) too
- Removing an album via "Remove from Collection" now adds its folder(s)
  to Ignored automatically, so a re-scan doesn't just re-discover the
  same folder and add it right back — a manual removal is a deliberate
  "I don't want this one", same as ignoring a Needs Review item. Un-ignore
  it from Scan Library's Ignored tab to reverse it.
- Deliberately doesn't apply to Settings' "Clear Library" — that's a bulk
  reset meant to be followed by a fresh re-scan, not "ignore everything".
- Verified end-to-end: removed an album, confirmed it showed up in
  Ignored with the folder path(s) it was actually matched from, re-scanned
  and confirmed it stayed gone, then un-ignored it and confirmed a re-scan
  brought it back.

## v11.4 — Multi-disc albums, and re-matching an album from its own page
- A multi-disc release split across sibling folders ("Album CD1"/"Album
  CD2", "Disc 1"/"Disc 2", etc.) is now recognized as **one** album, not
  two — lib/albumScanner.js merges them (same idea, and the same regex, as
  audiobookScanner.js's existing multi-part `.m4b` grouping, applied here
  to whole album folders instead of individual files), combining their
  tracks in disc order and stripping the disc marker from the guessed
  album name before matching. A lone "Disc 1"-named folder with no sibling
  is left alone, since that's genuinely just its name.
- `albums`/`album_scan_pending`/`album_ignored` all gained a `disc_paths`
  column tracking every folder a merged album's tracks came from — needed
  so a later scan recognizes all of them as already accounted for, not
  just the first, whether the album's already added, still pending, or
  ignored.
- Every album's own detail page gained a **Search Again** button —
  search either Last.fm or MusicBrainz fresh and pick a different result
  to fix a wrong match, without deleting and re-adding the album. Unlike
  Refresh Metadata (re-fetches the same match), this re-points the album
  at a completely different catalog entry, cover included — the same
  folder(s) on disk just get relabeled.

## v11.3 — Last.fm is now the default album search source
- Last.fm is now the default in Add Album/Needs Review's tab picker and
  the source folder scans auto-match against, with MusicBrainz as the
  secondary/fallback source in both places — reversing v11.2's default.
- Since Last.fm needs an API key and MusicBrainz doesn't, a scan
  automatically falls back to MusicBrainz whenever no Last.fm key is
  configured, rather than failing every album on a fresh install that
  hasn't set one up yet — the app still works out of the box with zero
  setup.
- lib/lastfm.js gained the same kind of request throttle
  lib/musicbrainz.js already has: fine for Vinyl's occasional sync, but a
  full album scan can now fire one search per unmatched album in a tight
  loop, which needed pacing against Last.fm's API the same way.
- `album_scan_pending` gained a `source` column recording which source a
  Needs Review item's pre-filled candidates actually came from, so its
  tab picker opens on the right tab instead of always defaulting to
  Last.fm with an empty list for an item a scan matched via MusicBrainz.

## v11.2 — Last.fm as a second album search source
- [Last.fm](https://www.last.fm) joins MusicBrainz as a second, independent
  search source in **Add Album** and **Needs Review** (same tabbed
  picker pattern Audiobooks already has for Audible/Apple Books) — for the
  occasional album MusicBrainz's own search misses. Needs a free API key
  (unlike MusicBrainz, which needs none), added in Settings under Music —
  Albums.
- AllMusic.com was considered first but has no public API and its
  `robots.txt` explicitly disallows automated access to its search pages —
  scraping it would've meant a fundamentally different (and fragile, ToS-
  violating) approach than every other source this app uses, so Last.fm
  was used instead.
- Scan-time auto-matching stays MusicBrainz-only, same reasoning as
  Audiobooks keeping Apple Books interactive-only: doubling every scan's
  external request count isn't worth it for a library-wide scan.

## v11.1 — Albums matched by embedded tags, not just folder names
- Album scans now read the first track's own embedded tags (ID3v2/v1 for
  MP3, Vorbis comments for FLAC/OGG, iTunes-style atoms for M4A) for the
  artist/album used to search MusicBrainz, falling back to the
  folder-name guess per-field only when a track has no usable tags. A
  correctly-tagged file matches regardless of how its folder happens to
  be named — the same "read the file's own metadata instead of guessing"
  principle already applied to EPUBs in v9.1, extended to four more
  binary formats (lib/audioTags.js), with no new dependency.

## v11.0 — Vinyl, backed by your Discogs collection
- **Vinyl** joins Albums as the second section under "Music" (now a sidebar
  group), but works completely differently from every other media type
  here: instead of scanning local files, it mirrors a collection you
  already maintain on [Discogs](https://www.discogs.com) — no folder, no
  env var, just a Discogs username and Personal Access Token entered in
  Settings, then a "Sync from Discogs" button (or auto-sync on a schedule,
  same as the file-scanning media types).
- A sync pulls your whole collection in a few paginated requests (cover,
  artist, format, label, genres, catalog number), respecting Discogs' own
  rate limit the same way lib/musicbrainz.js already respects
  MusicBrainz's. Re-syncing is idempotent — it updates existing records,
  adds new ones, and mirrors removals (an item taken off Discogs
  disappears here too), without re-touching a cover you've manually
  swapped in.
- Discogs is treated as the actual source of truth: there's no way to add,
  edit, or manually match a record from within this app at all — that
  happens on Discogs itself. "Remove from Local Library" and Settings'
  "Clear Local Vinyl Copy" only ever delete the local mirror; both come
  back on the next sync unless the item is also removed from the real
  Discogs collection.

## v10.0 — Music (Albums), a fourth media type
- **Music** joins Movies, Audiobooks and Ebooks as a full media type, under
  a new "Music" sidebar group (which also makes room for the Vinyl section
  alongside it) — its own library grid (with search/sort/Group by Artist),
  Add Album page, detail page with tracklist, and a Scan Library with the
  same tabbed Needs Review/Ignored view and batch select/skip/ignore the
  other media types have.
- Metadata (cover, artist, tracklist, genres, year) comes from
  [MusicBrainz](https://musicbrainz.org), with cover art from the
  [Cover Art Archive](https://coverartarchive.org) — both free, no API key.
  MusicBrainz limits unauthenticated clients to 1 request/second, so a full
  scan or bulk refresh is correspondingly slower than the other media
  types' — this app respects that limit automatically for every request.
- Unlike the other media types, an album is a **folder** of tracks
  (`.mp3`/`.flac`/`.m4a`/`.ogg`), not a single file. Scans group every
  folder that has those files directly inside into one album, and recognize
  either an `Artist/Album/tracks` (two nested folders) or a flat
  `Artist - Album/tracks` layout automatically under the new `ALBUMS_DIR`
  env var — same comma-separated multi-path support as the other media
  types' folder settings.
- Matching an album needs both the title AND the artist to line up (unlike
  the other media types' title-only check) — album titles alone are often
  ambiguous (self-titled albums, "Greatest Hits", a bare "IV"), so knowing
  the artist is what actually disambiguates a confident auto-match.
- Settings gained a full Music section: auto-scan, remove-missing, bulk
  metadata refresh, and Clear Library — same shape as the other media types.

## v9.1 — Much better ebook auto-matching
- Shared ebook collections very commonly name files "Author - Series NN -
  Title - Author" (the author bookends the whole filename around an
  optional series marker) — fed straight to Open Library's search, that
  whole string found nothing, so effectively every scanned file landed in
  Needs Review regardless of how well-known the book was. The scanner now
  strips the repeated author and series-number segment down to just the
  title before searching.
- More importantly, an EPUB's own embedded metadata (its Dublin Core
  title/author/ISBN, read directly out of the file — no filename guessing
  needed) is now used ahead of any filename-derived guess whenever it's
  present, and an ISBN resolves straight to its Open Library work with no
  title-matching step at all. Between the two, auto-matching an EPUB no
  longer depends much on how the file happens to be named.

## v9.0 — Ebooks, a third media type
- **Ebooks** joins Movies and Audiobooks as a full media type: its own
  sidebar tab, library grid (with search/sort/Group by Author, same as
  Audiobooks), Add Ebook page, detail page, and a Scan Library with the same
  tabbed Needs Review/Ignored view and batch select/skip/ignore that Movies
  and Audiobooks already have.
- Metadata (cover, author(s), description, genres, publisher, page count,
  ISBN) comes from [Open Library](https://openlibrary.org)'s free, no-key
  public API.
- Scans pick up `.epub`, `.pdf`, `.mobi` and `.azw3` files under `EBOOKS_DIR`
  (same comma-separated multi-path support as `MOVIES_DIR`/`AUDIOBOOKS_DIR`)
  — one library entry per file, since unlike audiobooks an ebook is never
  split across multiple files. Ebook filenames don't follow one dominant
  naming convention the way movies or audiobooks do, so the auto-guess is
  just the cleaned filename; anything that doesn't get an exact title match
  lands in Needs Review same as always.
- Settings gained a full Ebooks section: auto-scan, remove-missing, bulk
  metadata refresh, and Clear Library — same shape as Movies/Audiobooks.

## v8.2 — Tabbed Ignored view, plus Clear Library in Settings
- Scan Library's Needs Review and Ignored lists are now **tabs** instead of
  stacked sections, for both Movies and Audiobooks — makes it clearer at a
  glance how many of each there are, and keeps a long Ignored list from
  pushing Needs Review out of view.
- Movies' Scan Library gained the same **Ignore** button, permanent
  `movie_ignored` exclusion list, and checkbox-based **Select all** / **Skip
  Selected** / **Ignore Selected** batch actions that Audiobooks already had,
  so both media types behave the same way here.
- New **Clear Library** button in Settings for each media type — permanently
  deletes every movie or every audiobook (and their cached poster/cover
  files), behind a confirmation prompt. Doesn't touch scan history (Needs
  Review / Ignored), since those track specific files on disk rather than
  what's currently in the collection.

## v8.1 — Permanently ignore a Needs Review item, with batch selection
- "Skip this" on a Needs Review item only ever dismissed it for that one
  review — the file wasn't recorded anywhere, so the very next scan
  rediscovered it and put it right back. New **Ignore** button (next to
  Skip) permanently excludes that path instead, for things that are never
  going to have a real match (samples, bonus tracks, a folder the scanner
  got wrong). Ignored paths show up in a new **Ignored** list at the
  bottom of Scan Library with an **Un-ignore** button, in case one gets
  ignored by mistake.
- Each Needs Review item got a checkbox, plus **Select all** / **Skip
  Selected** / **Ignore Selected** above the list, for clearing out a
  scan that turned up a lot of junk at once instead of one at a time.
  Shift-click a checkbox to select the whole range from the last one you
  clicked, same as a file manager.

## v8.0 — Search Apple Books as a second audiobook source
- Most "major audiobook websites" (Libro.fm, Chirp, Storytel, Spotify, Kobo,
  Google Play) simply don't have a public search API to integrate with.
  Apple's iTunes Search API does — official, documented, free, no key —
  and gives genuinely independent catalog coverage from Audible, so it's
  now a second source rather than the only option.
- **Add Audiobook** and resolving a **Needs Review** item both gained an
  Audible / Apple Books tab switcher (same pattern as the movie poster
  picker's ThePosterDB/TMDB tabs), each with its own search box, URL-paste
  fallback, and results — switching tabs doesn't lose what you already
  found on the other one.
- Apple's catalog is thinner than Audible's (via Audnexus): no narrator,
  series, runtime, or rating, just title/author/cover/description/genre/
  year. A book added from Apple Books just has those fields blank rather
  than guessing at them. "Refresh Metadata" and the bulk refresh in
  Settings both know which source a book came from and refresh from the
  right one automatically.
- Scan-time auto-matching stays Audible-only for now — doubling every
  scan's external-request count to also try Apple automatically isn't
  worth it for a library-wide scan. Apple Books is there as a fallback for
  the books that need manual attention regardless (Needs Review), which is
  where a second source actually matters.

## v7.5 — Show source file(s) on the audiobook detail page
- Each audiobook's page now shows the on-disk file it was matched from (or
  all of them, for a multi-part book), so a match found by the scanner can
  be checked against the actual file — handy while getting a large,
  varied-naming library scanned in and confirming the auto-matches are
  actually right. Movies dropped this same info from their page a while
  back as clutter; audiobooks keep it for now since verifying matches is
  the more immediate need.

## v7.4 — Strip embedded years from audiobook search queries
- Files named like "Author - Year - Title" (e.g. "Stephen King - 1996 -
  Desperation.m4b") were guessing the whole dash-separated string as the
  search query, and a literal year as an Audible search keyword suppresses
  otherwise-good matches rather than narrowing them — the exact book would
  return zero results with the year included, and find it immediately
  without it. The scanner now drops a year segment from the query when
  it's clearly its own metadata field (at least 3 dash-separated parts,
  one of them nothing but a 19xx/20xx year) — "Author - Year - Title"
  becomes "Author - Title". A 2-segment name like "Author - 1984" is left
  alone, since that's genuinely ambiguous between incomplete metadata and
  a real title that happens to be a year (Orwell's included).
- Books using this naming convention still search correctly now, but land
  in Needs Review rather than auto-matching, since the query still
  includes the author and Audible's own title field doesn't — worth a
  follow-up if that turns out to matter in practice.

## v7.3 — Group audiobooks by author
- New "Group by Author" toggle in the Audiobooks toolbar. When on, the
  library groups books under a heading per author (sorted A-Z by author,
  with books lacking any author data bucketed last under "Unknown
  Author") instead of one flat grid. A book with multiple credited authors
  groups under whichever is listed first. The A-Z jump index switches to
  jumping by author initial while grouped, and the toggle — like search
  and sort — persists across a trip to a book's detail page and back.

## v7.2 — Fix multi-part .m4b books being split into separate entries
- A book split across several `.m4b` files (e.g. "Book Part 1.m4b" +
  "Book Part 2.m4b") was being scanned as two separate audiobooks — the
  scanner treated every `.m4b` in a folder as its own book, which is right
  for a folder of genuinely different books (a series dumped in one place)
  but wrong for one book split into parts. It now detects a trailing
  Part/Pt/Disc/CD/Volume/Vol marker (or "1 of 3" style) shared by two or
  more `.m4b` files in the same folder and groups them into a single
  multi-part entry, the same way it already did for `.mp3` parts — sorted
  by part number, not filename text. A lone file that happens to say
  "Part 1" with no sibling "Part 2" is left alone, and files with no
  shared base (like "Book One.m4b" + "Book Two.m4b") still become separate
  entries as before.

## v7.1 — Fix a single failed match aborting an entire audiobook scan
- A real-library scan (695 books) hit a network error on Audible's search
  API partway through and the whole scan died right there — everything
  after that one book was left completely unprocessed, reported as "0
  auto-matched · 0 need review · 0 skipped" even though hundreds of books
  behind it were perfectly fine. The per-book search/match/add is now
  wrapped in its own try/catch instead of one shared by the whole scan
  loop, so one failure just gets counted (new "N failed" in the scan
  status) and the rest of the library still gets processed. A failed book
  isn't recorded anywhere, so it's automatically retried on the next scan
  rather than needing anything manual.
- Added a browser User-Agent header to the Audible/Audnexus requests
  (previously sent with none, unlike ThePosterDB's client which already
  does this) — some APIs reject or drop a connection outright for Node's
  default fetch identification, which reads as a raw connection failure
  rather than an HTTP error and was the likely cause of the failure above.
- Added a small delay between external requests during a scan, partly
  courtesy to an unofficial API being hit hundreds of times per scan,
  partly to reduce the odds of tripping whatever's behind this in the
  first place.

## v7.0 — Audiobooks, and a media-type sidebar
- Added a full Audiobooks section, built the same way as Movies: library
  grid with search/sort, a detail page, manual add, folder scanning with a
  Needs Review queue, bulk metadata refresh, and its own Settings section.
  Metadata (cover, author/narrator, series, description, genres, runtime,
  rating) comes from Audible's own catalog search resolved through
  [Audnexus](https://audnex.us) — the same unofficial-but-widely-relied-on
  pairing self-hosted audiobook tools use.
- **Folder scanning treats a whole folder as one book**, not one entry per
  file, specifically to avoid the duplicate problem an audiobook library
  runs into that a movie library doesn't: a book can be a single `.m4b` or
  a folder of `.mp3`/`.m4a` parts. A folder with an `.m4b` uses that file
  and ignores any stray `.mp3`s alongside it (assumed to be the same book);
  a folder with no `.m4b` treats every audio file in it as one part of a
  single multi-part book, naturally sorted so "Part 2" comes before
  "Part 10". Two `.m4b`s in the same folder are still two separate books.
  New `AUDIOBOOKS_DIR` env var, same comma-separated multi-path support as
  `MOVIES_DIR`.
- Added a sticky left sidebar with one tab per media type (alphabetical —
  Audiobooks, then Movies), so switching between them doesn't need a full
  page reload. Movies moved from `/` to `/movies` (with `/` now
  redirecting there) so both sections have a consistent `/type`,
  `/type/:id`, `/type/add`, `/type/scan` URL shape — a future media type
  slots into the sidebar and routing the same way.
- Settings is now split into a Movies section and an Audiobooks section,
  each with their own auto-scan/prune/bulk-refresh controls, instead of
  one undifferentiated page.

## v6.3 — Actually switch the GHCR image to media-catalog
- The publish workflow's `IMAGE_NAME` was `${{ github.repository }}`,
  which — per v6.1 — doesn't reliably follow a repo rename in practice.
  Hardcoded it to `tet0r/media-catalog` instead, so this doesn't silently
  regress the next time the repo gets renamed (which is on the table,
  since the plan is to widen this beyond just movies). `docker-compose.yml`
  and the README point at `ghcr.io/tet0r/media-catalog` again, and this
  time it actually published there — confirmed via the new package page,
  already **public** by default (unlike the very first package back in
  v1.1, which needed a manual visibility change), so no extra step was
  needed before Portainer could pull it.

## v6.2 — Spelling: Media Catalogue → Media Catalog
- The brand name from v6.0 used the British spelling ("Catalogue"); changed
  every occurrence (browser tab title, in-app brand text, README heading,
  server startup log line) to "Media Catalog" instead.

## v6.1 — Fix Portainer pull failure after the rename
- v6.0 pointed `docker-compose.yml` and the README at
  `ghcr.io/tet0r/media-catalog`, on the assumption that renaming the GitHub
  repo would make the publish workflow start pushing there (it derives the
  image name from `${{ github.repository }}`). That assumption was wrong:
  GHCR doesn't rename a container package's existing image path just
  because its linked repo gets renamed, and the publish workflow kept
  resolving to the pre-rename name in practice — so `media-catalog` never
  existed as a pullable image, which is what broke Portainer's pull
  ("denied denied", GHCR's generic error for both "private" and
  "nonexistent"). `docker-compose.yml` and the README are back to the
  working `ghcr.io/tet0r/movie-cataloger` image path; the app itself is
  still user-visibly renamed, only the Docker image name is stuck on the
  old one for now.

## v6.0 — Renamed the project to Media Catalog
- Renamed everything: the GitHub repo (`movie-cataloger` → `media-catalog`),
  both `package.json` names, the browser tab title, and the in-app brand
  text ("🎬 Movie Cataloger" → "🎬 Media Catalog"). The GHCR image path
  turned out *not* to follow the rename — see v6.1 for the fix.
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
