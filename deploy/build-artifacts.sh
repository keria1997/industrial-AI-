#!/usr/bin/env bash
# 构建工业 AI 平台 Ubuntu 部署制品
# 在开发机 / CI 上运行，产出 deploy/artifacts/industrial-ai-<version>.tar.gz
#
# 用法：
#   bash deploy/build-artifacts.sh [version]
#   version 缺省时从 package.json 读取，再缺省为 latest
#
# 前置条件：本地已安装 Node.js 18+、npm 和 JDK/Maven，且已执行过 npm ci

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('./package.json').version || 'latest'" 2>/dev/null || echo "latest")"
fi

ARTIFACT_DIR="$REPO_ROOT/deploy/artifacts"
STAGING_DIR="$(mktemp -d)"
PKG_NAME="industrial-ai-${VERSION}"
STAGING_PKG_DIR="$STAGING_DIR/$PKG_NAME"

echo "==> 仓库根目录: $REPO_ROOT"
echo "==> 制品版本:   $VERSION"
echo "==> 临时目录:   $STAGING_PKG_DIR"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

# 1. 类型检查与测试（可选，通过环境变量跳过）
echo "==> 构建 Java 后端"
mvn -f server-java/pom.xml -o -DskipTests package
JAVA_JAR="$REPO_ROOT/server-java/target/industrial-ai-api-0.1.0.jar"
if [[ ! -f "$JAVA_JAR" ]]; then
  echo "ERROR: Java 后端 JAR 不存在: $JAVA_JAR" >&2
  exit 1
fi

if [[ "${SKIP_TEST:-0}" != "1" ]]; then
  echo "==> 执行类型检查与 Java 测试"
  npm run typecheck
  mvn -f server-java/pom.xml -o test
fi

# 2. 构建前端
echo "==> 构建前端 (vite build)"
npm run build

if [[ ! -d "$REPO_ROOT/dist" ]]; then
  echo "ERROR: 前端构建产物 dist/ 不存在" >&2
  exit 1
fi

# 3. 组装制品目录
echo "==> 组装制品目录"
mkdir -p "$STAGING_PKG_DIR/app" "$STAGING_PKG_DIR/deploy"

# 使用 cp -R src/. dst/ 语法，在 GNU coreutils 与 BSD cp 上行为一致
copy_dir_contents() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  cp -R "$src/." "$dst/"
}

# 前端构建产物
copy_dir_contents "$REPO_ROOT/dist" "$STAGING_PKG_DIR/app/dist"
if [[ ! -f "$STAGING_PKG_DIR/app/dist/index.html" ]]; then
  echo "ERROR: 前端构建产物缺少 app/dist/index.html" >&2
  exit 1
fi

# Java 后端 fat jar；PostgreSQL 迁移文件已包含在 JAR classpath 中
mkdir -p "$STAGING_PKG_DIR/app/server-java"
cp "$JAVA_JAR" "$STAGING_PKG_DIR/app/server-java/industrial-ai-api-0.1.0.jar"

# 部署脚本
cp "$REPO_ROOT/deploy/install-ubuntu.sh" "$STAGING_PKG_DIR/deploy/install-ubuntu.sh"
cp "$REPO_ROOT/deploy/deploy.sh" "$STAGING_PKG_DIR/deploy/deploy.sh"
cp "$REPO_ROOT/deploy/.env.production.example" "$STAGING_PKG_DIR/deploy/.env.production.example"
cp -R "$REPO_ROOT/deploy/nginx" "$STAGING_PKG_DIR/deploy/nginx"
cp -R "$REPO_ROOT/deploy/systemd" "$STAGING_PKG_DIR/deploy/systemd"
cp "$REPO_ROOT/deploy/README.md" "$STAGING_PKG_DIR/deploy/README.md"

# 版本元信息
cat > "$STAGING_PKG_DIR/MANIFEST.txt" <<EOF
industrial-ai $VERSION
build-time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
git-commit: ${BUILD_GIT_COMMIT:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)}
git-branch: ${BUILD_GIT_BRANCH:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}
node: $(node -v)
npm: $(npm -v)
java: $(java -version 2>&1 | head -n1)
mvn: $(mvn -version | head -n1)
EOF

cat "$STAGING_PKG_DIR/MANIFEST.txt"

# 4. 打包
mkdir -p "$ARTIFACT_DIR"
TARBALL="$ARTIFACT_DIR/${PKG_NAME}.tar.gz"
echo "==> 生成制品: $TARBALL"
tar -czf "$TARBALL" -C "$STAGING_DIR" "$PKG_NAME"

# 同时生成 sha256
(
  cd "$ARTIFACT_DIR"
  shasum -a 256 "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"
)

echo "==> 完成"
echo "    制品:    $TARBALL"
echo "    校验和:  $TARBALL.sha256"
echo "    大小:    $(du -h "$TARBALL" | awk '{print $1}')"
