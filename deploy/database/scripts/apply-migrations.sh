#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_DIR="$(cd "$SCRIPT_DIR/../init" && pwd)"
ENV_FILE="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)/.env}"
BASELINE_EXISTING="${BASELINE_EXISTING:-0}"

[[ -f "$ENV_FILE" ]] || { echo "Environment file not found: $ENV_FILE" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }
[[ -f "$INIT_DIR/MANIFEST.sha256" ]] || { echo "Initialization checksum manifest missing" >&2; exit 1; }
(cd "$INIT_DIR" && sha256sum -c MANIFEST.sha256 --quiet)

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is required" >&2; exit 1; }
CONNECTION_URL="${DATABASE_URL#jdbc:}"

psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc '
CREATE TABLE IF NOT EXISTS deploy_schema_migration (
  checksum text PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
)'

existing_tables="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc "
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('prod_bom','sales_order','iam_account','inv_availability_projection','inv_shipment_task','inv_sales_outbound')")"
recorded_count="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT count(*) FROM deploy_schema_migration')"

if (( existing_tables > 0 && recorded_count == 0 )); then
  if [[ "$BASELINE_EXISTING" != "1" ]]; then
    echo "Existing schema has no deployment baseline. Back it up and compare schema, then rerun with BASELINE_EXISTING=1." >&2
    exit 1
  fi
  echo "Registering reviewed existing schema baseline without executing SQL."
  while IFS= read -r file; do
    filename="${file##*/}"
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 \
      -v filename="$filename" -v checksum="$checksum" <<'SQL'
INSERT INTO deploy_schema_migration(checksum, filename)
VALUES (:'checksum', :'filename')
ON CONFLICT (filename) DO NOTHING
SQL
  done < <(find "$INIT_DIR" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' -print0 | sort -z | xargs -0 -n1 printf '%s\n')
fi

while IFS= read -r file; do
  filename="${file##*/}"
  checksum="$(sha256sum "$file" | awk '{print $1}')"
  recorded_for_file="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -v filename="$filename" -At <<'SQL'
SELECT checksum FROM deploy_schema_migration WHERE filename = :'filename';
SQL
  )"
  if [[ -n "$recorded_for_file" ]]; then
    [[ "$recorded_for_file" == "$checksum" ]] || { echo "Checksum changed for applied migration: $filename" >&2; exit 1; }
    echo "SKIP  $filename"
    continue
  fi
  echo "APPLY $filename"
  psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -f "$file"
  psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 \
    -v filename="$filename" -v checksum="$checksum" <<'SQL'
INSERT INTO deploy_schema_migration(checksum, filename)
VALUES (:'checksum', :'filename')
SQL
done < <(find "$INIT_DIR" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' -print0 | sort -z | xargs -0 -n1 printf '%s\n')

echo "Database migrations are current."
