#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_ROOT="$PROJECT_ROOT/deploy"
VERSION="$(sed -n 's/[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -1)"
STAMP="$(date -u +%Y%m%d%H%M%S)"
ARTIFACT_DIR="$DEPLOY_ROOT/artifacts"
BUILD_DIR="$ARTIFACT_DIR/build"
RELEASE_NAME="industrial-ai-${VERSION}-${STAMP}"
STAGE="$BUILD_DIR/$RELEASE_NAME"
SKIP_TESTS="${SKIP_TESTS:-0}"

log() { printf '[build-release] %s\n' "$*"; }
sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

[[ -n "$VERSION" ]] || { echo "Unable to determine project version" >&2; exit 1; }
[[ "$SKIP_TESTS" == "0" || "$SKIP_TESTS" == "1" ]] || { echo "SKIP_TESTS must be 0 or 1" >&2; exit 1; }

for tool in node npm mvn tar; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

mkdir -p "$ARTIFACT_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE/app" "$STAGE/config" "$STAGE/scripts" "$STAGE/database"

log "Installing locked frontend dependencies"
(cd "$PROJECT_ROOT" && npm ci)

if [[ "$SKIP_TESTS" == "1" ]]; then
  log "WARNING: SKIP_TESTS=1; creating an emergency release"
else
  log "Checking frontend types and running frontend tests"
  (cd "$PROJECT_ROOT" && npm run typecheck)
  (cd "$PROJECT_ROOT" && npm run test:frontend)
fi

log "Building frontend"
DIST_OUTPUT="dist-release-$STAMP"
(cd "$PROJECT_ROOT" && npm run build -- --outDir "$DIST_OUTPUT" --emptyOutDir)

log "Verifying Java routes"
(cd "$PROJECT_ROOT" && npm run test:routes:java)

if [[ "$SKIP_TESTS" == "1" ]]; then
  log "Packaging backend without tests"
  (cd "$PROJECT_ROOT" && mvn -f server-java/pom.xml clean package -DskipTests)
else
  log "Testing and packaging backend"
  (cd "$PROJECT_ROOT" && mvn -f server-java/pom.xml clean package)
fi

JAR="$PROJECT_ROOT/server-java/target/industrial-ai-api-${VERSION}.jar"
[[ -f "$JAR" ]] || { echo "Expected backend JAR is missing: $JAR" >&2; exit 1; }
[[ -f "$PROJECT_ROOT/$DIST_OUTPUT/index.html" ]] || { echo "Frontend release index.html is missing" >&2; exit 1; }

log "Assembling release $RELEASE_NAME"
cp "$JAR" "$STAGE/app/"
cp -R "$PROJECT_ROOT/$DIST_OUTPUT" "$STAGE/app/dist"
cp -R "$DEPLOY_ROOT/config/." "$STAGE/config/"
cp "$DEPLOY_ROOT/scripts/build-release.sh" "$DEPLOY_ROOT/scripts/install-ubuntu.sh" "$DEPLOY_ROOT/scripts/verify-release.sh" "$STAGE/scripts/"
cp -R "$DEPLOY_ROOT/database/." "$STAGE/database/"
cp "$DEPLOY_ROOT/.env.production.example" "$STAGE/.env.production.example"
for doc in "$DEPLOY_ROOT"/[0-9][0-9]-*.md; do
  cp "$doc" "$STAGE/"
done

cat > "$STAGE/MANIFEST.txt" <<EOF
name=industrial-ai-platform
version=$VERSION
build_utc=$STAMP
git_commit=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
frontend=React 18 / Vite 7
backend=Spring Boot 3.3 / Java 17
database=PostgreSQL 16.2 Ubuntu 24.04 amd64 bundle
tests=$([[ "$SKIP_TESTS" == "1" ]] && echo skipped || echo passed)
EOF

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$STAGE" && find . -type f ! -name 'MANIFEST.sha256' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > MANIFEST.sha256)
else
  (cd "$STAGE" && find . -type f ! -name 'MANIFEST.sha256' -print0 | LC_ALL=C sort -z | while IFS= read -r -d '' file; do shasum -a 256 "$file"; done > MANIFEST.sha256)
fi
TARBALL="$ARTIFACT_DIR/$RELEASE_NAME.tar.gz"
log "Creating $TARBALL"
(cd "$BUILD_DIR" && COPYFILE_DISABLE=1 tar -czf "$ARTIFACT_DIR/$RELEASE_NAME.tar.gz" "$RELEASE_NAME")
sha256_file "$TARBALL" > "$TARBALL.sha256"
rm -rf "$STAGE"
rm -rf "$PROJECT_ROOT/$DIST_OUTPUT"

log "Release ready: $TARBALL"
log "Checksum: $TARBALL.sha256"
