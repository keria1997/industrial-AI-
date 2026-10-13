#!/usr/bin/env bash
# Ubuntu 服务器系统依赖一次性安装脚本
# 职责：安装 Java 17 运行时、PostgreSQL 16、nginx、UFW 配置、创建系统用户与目录
#
# 用法：
#   sudo bash install-ubuntu.sh
#
# 幂等：可重复执行，已安装组件会跳过
# 适用：Ubuntu 22.04 / 24.04 LTS (x86_64)

set -euo pipefail

# 必须以 root 执行
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: 请使用 sudo 执行：sudo bash install-ubuntu.sh" >&2
  exit 1
fi

# 可配置变量
APP_USER="${APP_USER:-industrial-ai}"
APP_HOME="${APP_HOME:-/opt/industrial-ai}"
JAVA_MAJOR="${JAVA_MAJOR:-17}"
PG_MAJOR="${PG_MAJOR:-16}"
PG_DB_NAME="${PG_DB_NAME:-industrial_ai}"
PG_DB_USER="${PG_DB_USER:-industrial_ai}"

echo "==> 检测 Ubuntu 版本"
if ! [[ -f /etc/os-release ]]; then
  echo "ERROR: 未找到 /etc/os-release，仅支持 Ubuntu 22.04/24.04" >&2
  exit 1
fi
. /etc/os-release
echo "    $PRETTY_NAME ($ID $VERSION_ID)"
if [[ "$ID" != "ubuntu" ]] || ! [[ "$VERSION_ID" =~ ^(22.04|24.04)$ ]]; then
  echo "ERROR: 仅支持 Ubuntu 22.04 / 24.04" >&2
  exit 1
fi

echo "==> 更新 apt 索引并安装基础工具"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release \
  ufw build-essential

# 1. Java 17 runtime
echo "==> 安装 Java ${JAVA_MAJOR} 运行时"
apt-get install -y --no-install-recommends "openjdk-${JAVA_MAJOR}-jre-headless"
echo "    java $(java -version 2>&1 | head -n1)"

# 2. PostgreSQL 16
echo "==> 安装 PostgreSQL ${PG_MAJOR}"
if ! command -v psql >/dev/null 2>&1; then
  if [[ ! -f /etc/apt/keyrings/pgdg.gpg ]]; then
    curl -fsSL "https://www.postgresql.org/media/keys/ACCC4CF8.asc" \
      | gpg --dearmor -o /etc/apt/keyrings/pgdg.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main ${PG_MAJOR}" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y "postgresql-${PG_MAJOR}"
fi
echo "    psql $(psql --version)"

# 3. nginx
echo "==> 安装 nginx"
apt-get install -y --no-install-recommends nginx

# 4. 创建应用用户与目录
echo "==> 创建系统用户 ${APP_USER} 与目录 ${APP_HOME}"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --home-dir "$APP_HOME" "$APP_USER"
fi
mkdir -p "$APP_HOME"/{app,releases,current,logs}
chown -R "$APP_USER":"$APP_USER" "$APP_HOME"

# 5. PostgreSQL 数据库与账号
echo "==> 创建数据库 ${PG_DB_NAME} 与账号 ${PG_DB_USER}"
PG_PASSWORD="${PG_PASSWORD:-}"
if [[ -z "$PG_PASSWORD" ]]; then
  PG_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)"
  echo "    已生成随机数据库密码（请妥善保存）："
  echo "    >>>  $PG_PASSWORD  <<<"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL || true
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_DB_USER}') THEN
    CREATE ROLE "${PG_DB_USER}" LOGIN PASSWORD '${PG_PASSWORD}';
  ELSE
    ALTER ROLE "${PG_DB_USER}" WITH PASSWORD '${PG_PASSWORD}';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL || true
SELECT 'CREATE DATABASE ${PG_DB_NAME} OWNER ${PG_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${PG_DB_NAME} TO ${PG_DB_USER};
SQL
# 启用 pgcrypto（迁移脚本可能依赖）
sudo -u postgres psql -d "$PG_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true
echo "    数据库连接串：postgresql://${PG_DB_USER}:***@127.0.0.1:5432/${PG_DB_NAME}"

# 6. 防火墙
echo "==> 配置 UFW"
if ! ufw status | grep -q "Status: active"; then
  ufw --force enable
fi
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
# 不开放 5185 端口：仅 nginx 通过 127.0.0.1 访问
echo "    UFW 已开启：仅允许 SSH 与 Nginx (80/443)"

# 7. systemd 与 nginx 自启
systemctl enable postgresql
systemctl enable nginx
systemctl restart postgresql

echo ""
echo "==> 系统依赖安装完成"
echo "    应用目录:  $APP_HOME"
echo "    应用账号:  $APP_USER"
echo "    数据库:    $PG_DB_NAME (owner=$PG_DB_USER)"
echo ""
echo "下一步：上传制品包并执行 deploy/deploy.sh"
