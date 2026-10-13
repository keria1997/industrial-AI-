#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/../packages/ubuntu-24.04-amd64" && pwd)"
SKIP_POSTGRES_INSTALL="${SKIP_POSTGRES_INSTALL:-0}"

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }
[[ "$(dpkg --print-architecture)" == "amd64" ]] || { echo "Expected amd64 architecture" >&2; exit 1; }
grep -q '^ID=ubuntu$' /etc/os-release || { echo "Expected Ubuntu host" >&2; exit 1; }
grep -q '^VERSION_ID="24.04"$' /etc/os-release || { echo "Expected Ubuntu 24.04 LTS" >&2; exit 1; }

if [[ "$SKIP_POSTGRES_INSTALL" == "1" ]]; then
  echo "Skipping PostgreSQL package installation."
  exit 0
fi

manifest="$PACKAGE_DIR/MANIFEST.sha256"
[[ -f "$manifest" ]] || { echo "Package checksum manifest missing: $manifest" >&2; exit 1; }
(cd "$PACKAGE_DIR" && sha256sum -c MANIFEST.sha256 --quiet)

export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends "$PACKAGE_DIR"/*.deb
systemctl enable --now postgresql
/usr/lib/postgresql/16/bin/pg_isready
echo "PostgreSQL 16 package installation passed."
