#!/bin/bash
# Snapshot the game pool out of the running container and keep the last few copies.
# Run on the server; cron-friendly. The database is in WAL mode, so rather than copying
# files it asks SQLite for a consistent copy (VACUUM INTO), checks that copy, and
# pulls the single resulting file out of the volume. The app keeps running.
#
#   deploy/backup.sh                                   # ~/backups/steamgram/steamgram-2026-09-07-0300.sqlite
#   BACKUP_DIR=/mnt/usb/steamgram KEEP=30 deploy/backup.sh
#
# Nightly at 03:00, keeping two weeks (crontab -e):
#   0 3 * * * /var/www/steamgram.app/deploy/backup.sh >> /var/log/steamgram-backup.log 2>&1
#
# Copy the snapshots off the server now and then; a backup on the same disk is not one.
#
# Restore: stop the container; in the volume delete steamgram.sqlite-wal and
# steamgram.sqlite-shm, copy a snapshot in as steamgram.sqlite owned by uid 1000
# (the container's `node` user); start the container again.
set -euo pipefail

CONTAINER=${CONTAINER:-steamgram}
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups/steamgram}
KEEP=${KEEP:-7}

SNAP="snapshot-$$.sqlite"
DEST="$BACKUP_DIR/steamgram-$(date +%F-%H%M).sqlite"
cleanup() { docker exec "$CONTAINER" rm -f "data/$SNAP" 2>/dev/null || true; }
trap cleanup EXIT

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "container $CONTAINER is not running" >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"

# Consistent copy from a read transaction, then an integrity check on the copy itself.
# Prints the number of games so the log shows what each snapshot holds.
games=$(
  docker exec -i -e SNAP="$SNAP" "$CONTAINER" node --no-warnings=ExperimentalWarning - <<'JS'
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync('data/steamgram.sqlite')
db.exec(`VACUUM INTO 'data/${process.env.SNAP}'`)
db.close()
const copy = new DatabaseSync(`data/${process.env.SNAP}`)
const ok = copy.prepare('PRAGMA integrity_check').get().integrity_check
const n = copy.prepare('SELECT COUNT(*) AS n FROM games').get().n
copy.close()
if (ok !== 'ok') { console.error(`integrity check failed: ${ok}`); process.exit(1) }
console.log(n)
JS
)

docker cp "$CONTAINER:/app/apps/api/data/$SNAP" "$DEST"

# Keep only the newest $KEEP snapshots.
ls -1t "$BACKUP_DIR"/steamgram-*.sqlite 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "$(date '+%F %T') $DEST ($games games, $(du -h "$DEST" | cut -f1))"
