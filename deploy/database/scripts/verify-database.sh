#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_DIR="$(cd "$SCRIPT_DIR/../init" && pwd)"
ENV_FILE="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)/.env}"

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

server_version="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT current_setting('server_version_num')::int")"
(( server_version >= 150000 )) || { echo "PostgreSQL 15+ is required" >&2; exit 1; }

recorded="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT count(*) FROM deploy_schema_migration')"
[[ "$recorded" == "30" ]] || { echo "Expected 30 recorded migrations, found $recorded" >&2; exit 1; }

tables="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc "
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('prod_bom','sales_order','iam_account','inv_availability_projection','inv_shipment_task','inv_sales_outbound')")"
[[ "$tables" == "6" ]] || { echo "Expected six core business tables, found $tables" >&2; exit 1; }

uuid_function="$(psql "$CONNECTION_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT count(*) FROM pg_proc WHERE proname = $q$gen_random_uuid$q$')"
(( uuid_function >= 1 )) || { echo "gen_random_uuid function is unavailable" >&2; exit 1; }

echo "Database verification passed."
