#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: sudo $0 /path/to/extracted-release" >&2
  exit 2
}

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0 ..." >&2; exit 1; }
[[ $# -eq 1 ]] || usage

SOURCE_DIR="$(cd "$1" && pwd)"
BASE=/opt/industrial-ai
APP_USER=industrial-ai
SERVICE_NAME=industrial-ai-api
INSTALL_DB="${INSTALL_DB:-1}"
RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-1}"
INSTALL_NGINX="${INSTALL_NGINX:-1}"
INSTALL_SERVICE="${INSTALL_SERVICE:-1}"

[[ -f "$SOURCE_DIR/MANIFEST.sha256" ]] || { echo "Release manifest missing" >&2; exit 1; }
[[ -f "$SOURCE_DIR/app/industrial-ai-api-0.1.0.jar" ]] || { echo "Backend JAR missing" >&2; exit 1; }
[[ -f "$SOURCE_DIR/.env" ]] || { echo "$SOURCE_DIR/.env is required; copy .env.production.example first" >&2; exit 1; }
[[ -f "$SOURCE_DIR/app/dist/index.html" ]] || { echo "Built frontend missing" >&2; exit 1; }

command -v apt-get >/dev/null 2>&1 || { echo "This installer targets Ubuntu/Debian" >&2; exit 1; }
[[ "$(dpkg --print-architecture)" == "amd64" ]] || { echo "Expected amd64 architecture" >&2; exit 1; }
grep -q '^ID=ubuntu$' /etc/os-release || { echo "Expected Ubuntu host" >&2; exit 1; }
grep -q '^VERSION_ID="24.04"$' /etc/os-release || { echo "Expected Ubuntu 24.04 LTS" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends openjdk-17-jre-headless nginx curl ca-certificates

getent group "$APP_USER" >/dev/null 2>&1 || groupadd --system "$APP_USER"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --gid "$APP_USER" --home-dir "$BASE" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$BASE" "$BASE/releases" "$BASE/logs"

build_utc="$(sed -n 's/^build_utc=//p' "$SOURCE_DIR/MANIFEST.txt" | head -1)"
git_commit="$(sed -n 's/^git_commit=//p' "$SOURCE_DIR/MANIFEST.txt" | head -1)"
RELEASE_ID="${build_utc}-${git_commit}"
[[ "$RELEASE_ID" =~ ^[0-9]{14}-[0-9a-f]{40}$ ]] || RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-manual"
RELEASE_DIR="$BASE/releases/$RELEASE_ID"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp -R "$SOURCE_DIR"/. "$RELEASE_DIR"/
rm -f "$RELEASE_DIR/.env"
chown -R root:root "$RELEASE_DIR"
chmod -R u=rwX,go=rX "$RELEASE_DIR"
install -o "$APP_USER" -g "$APP_USER" -m 0600 "$SOURCE_DIR/.env" "$RELEASE_DIR/.env"

if [[ "$INSTALL_DB" == "1" ]]; then
  "$RELEASE_DIR/database/scripts/install-postgresql-offline.sh"
  "$RELEASE_DIR/database/scripts/create-database.sh" "$RELEASE_DIR/.env"
fi
if [[ "$RUN_DB_MIGRATIONS" == "1" ]]; then
  "$RELEASE_DIR/database/scripts/apply-migrations.sh" "$RELEASE_DIR/.env"
  "$RELEASE_DIR/database/scripts/verify-database.sh" "$RELEASE_DIR/.env"
fi

ln -sfn "$RELEASE_DIR" "$BASE/current"

if [[ "$INSTALL_NGINX" == "1" ]]; then
  install -o root -g root -m 0644 "$RELEASE_DIR/config/nginx/industrial-ai.conf" /etc/nginx/sites-available/industrial-ai.conf
  ln -sfn /etc/nginx/sites-available/industrial-ai.conf /etc/nginx/sites-enabled/industrial-ai.conf
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
fi

if [[ "$INSTALL_SERVICE" == "1" ]]; then
  install -o root -g root -m 0644 "$RELEASE_DIR/config/systemd/industrial-ai-api.service" "/etc/systemd/system/$SERVICE_NAME.service"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
fi

API_PORT="$(grep '^PRODUCTION_API_PORT=' "$RELEASE_DIR/.env" | tail -1 | cut -d= -f2)"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/healthz" >/dev/null 2>&1; then
    echo "Release $RELEASE_ID installed and healthy."
    echo "Active release: $BASE/current"
    exit 0
  fi
  sleep 1
done

echo "API health check failed after installation" >&2
journalctl -u "$SERVICE_NAME" -n 100 --no-pager >&2 || true
exit 1
