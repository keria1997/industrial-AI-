# 03 - PostgreSQL 部署与校验

## 随包软件

`database/packages/ubuntu-24.04-amd64/` 包含 PostgreSQL Server 16.2、PostgreSQL Client 16.2、`postgresql-common`、客户端管理工具，以及从 Ubuntu 24.04 `noble/main` 索引解析出的 `amd64` 依赖闭包。`noble-main-amd64-Packages.gz` 记录了解析这些软件包时使用的源索引。

PostgreSQL 以 Ubuntu 原生服务方式安装。整个流程不使用容器。

## 安装数据库软件包

在解压后的发布目录中以 root 执行：

```bash
sudo ./database/scripts/install-postgresql-offline.sh
```

脚本会校验 Ubuntu 24.04 和 `amd64` 架构，校验全部软件包 SHA256，然后通过 apt 安装本地 `.deb` 集合，并禁用推荐包。

如果 PostgreSQL 由其他部署系统统一管理，使用：

```bash
sudo SKIP_POSTGRES_INSTALL=1 ./database/scripts/install-postgresql-offline.sh
```

不要将本软件包与不同 Ubuntu 版本、不同架构或其他来源的 PostgreSQL 包混装。

## 创建角色和数据库

先在发布目录准备好 `.env`。`create-database.sh` 会从 `DATABASE_URL` 解析应用角色、密码和数据库名：

```text
DATABASE_URL=jdbc:postgresql://industrial_ai:STRONG_PASSWORD@127.0.0.1:5432/industrial_ai
```

数据库密码建议使用 `openssl rand -hex 24` 生成，强度足够并避免 JDBC URL 转义问题。

创建或更新角色和数据库：

```bash
sudo ./database/scripts/create-database.sh /opt/industrial-ai/current/.env
```

脚本可重复执行：角色或数据库不存在时创建；角色已存在时刷新密码；数据库已存在时不重复创建。

## 初始化和迁移

`database/init/` 是从 `server-java/src/main/resources/db/migrations/` 按顺序复制的数据库初始化脚本：

```text
001_production_p0.sql
...
030_mps_menu_permission.sql
```

按文件名顺序应用所有未执行脚本：

```bash
sudo ./database/scripts/apply-migrations.sh /opt/industrial-ai/current/.env
```

首次执行会创建 `deploy_schema_migration`，并记录每个脚本的 SHA256。之后重复执行时，已完成脚本会被跳过。如果已应用脚本的内容发生变化，脚本会立即失败，不允许静默修改生产 schema。

如果目标数据库早于本部署套件，并且 DBA 已确认 30 个迁移全部已经生效，可只登记基线而不执行 SQL：

```bash
sudo BASELINE_EXISTING=1 ./database/scripts/apply-migrations.sh /opt/industrial-ai/current/.env
```

只有在完成备份并人工比对 schema 后才能使用该选项。不要修改 `database/init/` 中的任何文件；升级时应发布经过评审的新迁移集。

## 校验数据库

```bash
sudo ./database/scripts/verify-database.sh /opt/industrial-ai/current/.env
```

校验脚本会检查：

- PostgreSQL 服务端版本不低于 15；随包软件为 16.2。
- `database/init/MANIFEST.sha256` 中全部 30 个 SQL 校验一致。
- `deploy_schema_migration` 正好记录 30 个迁移。
- 生产、销售、IAM、库存和出库相关核心表存在。
- `gen_random_uuid()` 可用。
- 使用 `DATABASE_URL` 可以成功连接。

成功输出：

```text
Database verification passed.
```

## 手工检查命令

这些命令只用于检查或受控恢复：

```bash
sudo -u postgres psql
sudo systemctl status postgresql --no-pager
sudo -u postgres /usr/lib/postgresql/16/bin/pg_isready
```

应用通过 `DATABASE_URL` 拥有业务 schema。不要在评审过的迁移之外执行交互式 DDL。
