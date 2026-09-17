#!/bin/sh
set -eu

RESOURCE_UUID="${MEZZO_RESOURCE_UUID:-2jizxsqzkws7sc9gyrz77pxc}"
BACKUP_DIR="${MEZZO_BACKUP_DIR:-/var/backups/mezzo}"
TARGET_ENV="${MEZZO_BACKUP_ENV:-/etc/mezzo-backup.env}"
KEEP_DAYS="${MEZZO_BACKUP_KEEP_DAYS:-30}"

container=$(docker ps -qf "name=^postgres-${RESOURCE_UUID}")
if [ -z "$container" ]; then
  echo "$(date -u +%FT%TZ) FAILED: no running postgres container for resource ${RESOURCE_UUID}" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
dump="${BACKUP_DIR}/mezzo-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker exec "$container" pg_dump -U mezzo -d mezzo -Fc -n public > "${dump}.partial"
mv "${dump}.partial" "$dump"

if ! docker exec -i --env-file "$TARGET_ENV" "$container" sh -c '
  cat > /tmp/mezzo-backup.dump &&
  pg_restore -l /tmp/mezzo-backup.dump | grep -vE " SCHEMA - public | COMMENT - SCHEMA public " > /tmp/mezzo-backup.list &&
  pg_restore -L /tmp/mezzo-backup.list --clean --if-exists --no-owner --no-privileges \
    --single-transaction --exit-on-error -d postgres /tmp/mezzo-backup.dump
  status=$?
  rm -f /tmp/mezzo-backup.dump /tmp/mezzo-backup.list
  exit $status' < "$dump"; then
  echo "$(date -u +%FT%TZ) FAILED: restore into Supabase; previous copy left intact, local dump kept at ${dump}" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'mezzo-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) OK: $(du -h "$dump" | cut -f1) copied to Supabase, local dump ${dump}"
