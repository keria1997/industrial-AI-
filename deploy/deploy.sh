#!/usr/bin/env bash
# 工业AI平台部署主脚本
# 职责：解压制品、配置 .env、迁移数据库、安装 systemd 与 nginx、滚动重启
#
# 用法：
#   sudo bash deploy.sh <制品tar包路径> [版本号]
#   例:  sudo bash deploy.sh /tmp/industrial-ai-0.1.0.tar.gz 0.1.0
#
# 必须以 root 执行，且 install-ubuntu.sh 已先执行过

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: 请使用 sudo 执行：sudo bash deploy.sh <tarball> [version]" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: sudo bash deploy.sh <tarball> [version]" >&2
  exit 1
fi

TARBALL="$1"
VERSION="${2:-}"

APP_USER="industrial-ai"
APP_HOME="/opt/industrial-ai"
RELEASES_DIR="$APP_HOME/releases"
CURRENT_LINK="$APP_HOME/current"
ENV_FILE="$APP_HOME/current/.env"

# 从 tar 包文件名推断版本号
if [[ -z "$VERSION" ]]; then
  VERSION="$(basename "$TARBALL" .tar.gz | sed 's/^industrial-ai-//')"
fi
if [[ -z "$VERSION" ]]; then
  VERSION="release-$(date +%Y%m%d%H%M%S)"
fi

echo "==> 制品:   $TARBALL"
echo "==> 版本:   $VERSION"
echo "==> 目标:   $RELEASES_DIR/$VERSION"

if [[ ! -f "$TARBALL" ]]; then
  echo "ERROR: 制品包不存在: $TARBALL" >&2
  exit 1
fi

# 1. 准备发布目录
RELEASE_DIR="$RELEASES_DIR/$VERSION"
if [[ -e "$RELEASE_DIR" ]]; then
  echo "ERROR: 发布目录已存在，避免覆盖: $RELEASE_DIR" >&2
  echo "       如需重部署，先删除该目录或更换版本号" >&2
  exit 1
fi
TMP_EXTRACT="$(mktemp -d)"
trap "rm -rf $TMP_EXTRACT" EXIT
tar -xzf "$TARBALL" -C "$TMP_EXTRACT"
# 制品内顶层目录名形如 industrial-ai-<version>
TOP_DIR="$(ls -A "$TMP_EXTRACT" | head -n1)"
if [[ ! -d "$TMP_EXTRACT/$TOP_DIR" ]]; then
  echo "ERROR: 制品包结构异常" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
cp -R "$TMP_EXTRACT/$TOP_DIR/." "$RELEASE_DIR/"
chown -R "$APP_USER":"$APP_USER" "$RELEASE_DIR"
if [[ ! -f "$RELEASE_DIR/app/dist/index.html" ]]; then
  echo "ERROR: 制品缺少 app/dist/index.html，拒绝部署" >&2
  exit 1
fi

# 2. 处理 .env 配置
ENV_SRC="$RELEASE_DIR/deploy/.env.production.example"
# 沿用上一次的 .env；首次部署则从模板生成
if [[ -L "$CURRENT_LINK" && -f "$CURRENT_LINK/.env" ]]; then
  cp "$CURRENT_LINK/.env" "$RELEASE_DIR/.env"
  echo "==> 沿用既有 .env"
else
  if [[ ! -f "$ENV_SRC" ]]; then
    echo "ERROR: 制品缺少 deploy/.env.production.example" >&2
    exit 1
  fi
  cp "$ENV_SRC" "$RELEASE_DIR/.env"
  echo "==> 已从模板生成 .env，请编辑后重新运行"
  echo "    $RELEASE_DIR/.env"
  echo ""
  echo "    必须修改以下字段后再次执行本脚本："
  echo "      AUTH_SECRET            (openssl rand -base64 48)"
  echo "      FULFILLMENT_DATA_KEY   (openssl rand -base64 32)"
  echo "      DATABASE_URL           (使用 install-ubuntu.sh 输出的密码)"
  chown "$APP_USER":"$APP_USER" "$RELEASE_DIR/.env"
  chmod 600 "$RELEASE_DIR/.env"
  # 即使首次也建立 current 软链，方便用户找到 .env
  ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
  exit 0
fi
chmod 600 "$RELEASE_DIR/.env"
chown "$APP_USER":"$APP_USER" "$RELEASE_DIR/.env"

# 3. 运行数据库迁移（Java fat jar 内置迁移链）
echo "==> 运行数据库迁移"
APP_DIR="$RELEASE_DIR/app"
APP_JAR="$APP_DIR/server-java/industrial-ai-api-0.1.0.jar"
if [[ ! -f "$APP_JAR" ]]; then
  echo "ERROR: Java 后端制品不存在: $APP_JAR" >&2
  exit 1
fi
sudo -u "$APP_USER" bash -c "
  set -euo pipefail
  set -a
  source '$RELEASE_DIR/.env'
  set +a
  java -jar '$APP_JAR' \
    --spring.main.web-application-type=none \
    --app.database.migrate=true \
    --app.migration.exit=true
"

# 4. 切换 current 软链
echo "==> 切换 current -> $RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

# 5. 安装 systemd 服务
echo "==> 安装 systemd 服务单元"
install -m 644 "$RELEASE_DIR/deploy/systemd/industrial-ai-api.service" \
  /etc/systemd/system/industrial-ai-api.service
systemctl daemon-reload
systemctl enable industrial-ai-api

# 6. 安装 nginx 站点
echo "==> 安装 nginx 站点配置"
install -m 644 "$RELEASE_DIR/deploy/nginx/industrial-ai.conf" \
  /etc/nginx/sites-available/industrial-ai.conf
# 移除默认站点避免冲突
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/industrial-ai.conf /etc/nginx/sites-enabled/industrial-ai.conf

nginx -t
systemctl reload nginx

# 7. 重启后端
echo "==> 重启后端服务"
systemctl restart industrial-ai-api

# 8. 等待启动
API_PORT="$(grep -E '^PRODUCTION_API_PORT=' "$RELEASE_DIR/.env" | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-5185}"
echo "==> 等待启动 (端口 $API_PORT)"
for i in {1..15}; do
  if systemctl is-active --quiet industrial-ai-api \
     && ss -tlnp 2>/dev/null | grep -q ":${API_PORT} "; then
    echo "    服务已启动"
    break
  fi
  sleep 1
done

# 9. 状态汇总
echo ""
echo "==> 部署完成"
echo "    版本:       $VERSION"
echo "    发布目录:   $RELEASE_DIR"
echo "    current:    $CURRENT_LINK -> $RELEASE_DIR"
echo "    systemd:    industrial-ai-api"
echo "    日志:       $APP_HOME/logs/api.log, api.err.log"
echo ""
echo "常用命令："
echo "  systemctl status  industrial-ai-api"
echo "  journalctl -u     industrial-ai-api -f"
echo "  tail -f           $APP_HOME/logs/api.log"
echo "  nginx -t && systemctl reload nginx"
echo ""
echo "清理旧版本（保留最近 5 个）："
echo "  ls -1dt $RELEASES_DIR/*/ | tail -n +6 | xargs rm -rf"
