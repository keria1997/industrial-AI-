#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$RELEASE_DIR/.env}"
VERIFY_DB="${VERIFY_DB:-1}"

[[ -f "$ENV_FILE" ]] || { echo "Environment file not found: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${PRODUCTION_API_HOST:=127.0.0.1}"
: "${PRODUCTION_API_PORT:=5185}"
API_URL="http://${PRODUCTION_API_HOST}:${PRODUCTION_API_PORT}/healthz"
HEALTH_JSON="$(curl -fsS --max-time 10 "$API_URL")"
grep -q '"status":"ok"' <<<"$HEALTH_JSON" || { echo "Unexpected API health response: $HEALTH_JSON" >&2; exit 1; }
echo "API health passed: $API_URL"

if [[ "${NGINX_VERIFY:-1}" == "1" ]]; then
  FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1/healthz}"
  curl -fsS --max-time 10 "$FRONTEND_URL" | grep -q '"status":"ok"' || { echo "Nginx/API health failed: $FRONTEND_URL" >&2; exit 1; }
  curl -fsS --max-time 10 "${FRONTEND_URL%/healthz}/" | grep -q '<div id="root"></div>' || { echo "Frontend index failed" >&2; exit 1; }
  echo "Nginx and frontend checks passed."
fi

if [[ "$VERIFY_DB" == "1" ]]; then
  "$RELEASE_DIR/database/scripts/verify-database.sh" "$ENV_FILE"
fi

if systemctl is-active --quiet industrial-ai-api; then
  echo "industrial-ai-api service is active."
else
  echo "industrial-ai-api service is not active" >&2
  exit 1
fi

echo "Release verification passed."
