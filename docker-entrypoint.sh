#!/bin/sh
# Starts the app as the unprivileged "node" user instead of root, so that a bug
# in the app can't be used to take over the whole container.
#
# Existing installs complicate that: the /data (and /backups) folders were
# created and filled while the app still ran as root, so the unprivileged user
# can't write to them. This takes care of it on startup:
#   1. if the app's folders aren't writable for the "node" user, hand them over
#      to it (a one-time recursive chown; later starts find them already
#      writable and skip it);
#   2. start the app as "node" if that worked;
#   3. if it didn't (a network share that refuses chown, say), keep running as
#      root rather than fail to start — and say so in the log.

APP_USER=node
DATA="${DATA_DIR:-/data}"
BACKUPS="${BACKUP_DIR:-$DATA/backups}"

# Not started as root (e.g. `docker run --user ...`): nothing to switch.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

if ! command -v su-exec >/dev/null 2>&1; then
  echo "WARNING: su-exec is missing; running as root." >&2
  exec "$@"
fi

# Can the unprivileged user write to this folder (and to the database in it)?
writable() {
  [ -d "$1" ] || return 0
  su-exec "$APP_USER" sh -c 'test -w "$1" && { [ ! -e "$1/library.db" ] || test -w "$1/library.db"; }' sh "$1"
}

ready=1
for dir in "$DATA" "$BACKUPS"; do
  if ! writable "$dir"; then
    echo "Giving $dir to the '$APP_USER' user (the app no longer runs as root)..."
    chown -R "$APP_USER:$APP_USER" "$dir" 2>/dev/null
    writable "$dir" || ready=0
  fi
done

if [ "$ready" = "1" ]; then
  exec su-exec "$APP_USER" "$@"
fi

echo "WARNING: $DATA or $BACKUPS can't be made writable for the '$APP_USER' user, so the app is running as root." >&2
echo "         Give that folder to uid $(id -u "$APP_USER") on the host to run it unprivileged." >&2
exec "$@"
