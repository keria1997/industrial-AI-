#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)/.env}"

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0 <env-file>" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Environment file not found: $ENV_FILE" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql is required; install PostgreSQL packages first" >&2; exit 1; }
command -v runuser >/dev/null 2>&1 || { echo "runuser is required" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is required" >&2; exit 1; }

jdbc_rem="${DATABASE_URL#jdbc:postgresql://}"
authority="${jdbc_rem%%/*}"
path="${jdbc_rem#*/}"
userinfo="${authority%%@*}"
DB_USER="${userinfo%%:*}"
DB_PASSWORD="${userinfo#*:}"
DB_NAME="${path%%\?*}"
[[ -n "$DB_USER" && -n "$DB_PASSWORD" && -n "$DB_NAME" ]] || {
  echo "DATABASE_URL must contain user, password, and database name" >&2
  exit 1
}

runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
  -v db_user="$DB_USER" -v db_password="$DB_PASSWORD" -v db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SQL

connection_url="${DATABASE_URL#jdbc:}"
psql "$connection_url" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database(), current_user'
echo "Application role and database are ready."
