# 03 - PostgreSQL Deployment and Verification

## Included Software

`database/packages/ubuntu-24.04-amd64/` contains PostgreSQL Server 16.2, PostgreSQL Client 16.2, `postgresql-common`, client management tools, and the recursive dependency closure from Ubuntu 24.04 `noble/main` for `amd64`. `noble-main-amd64-Packages.gz` records the source package index used to build the bundle.

PostgreSQL is installed as a native Ubuntu service. No container runtime is involved.

## Install Packages

```bash
sudo ./database/scripts/install-postgresql-offline.sh
```

The script verifies Ubuntu 24.04/amd64, checks every package checksum, and asks apt to install the local `.deb` set without recommended packages. If another deployment process owns PostgreSQL, set `SKIP_POSTGRES_INSTALL=1`.

Do not mix this bundle with PostgreSQL packages built for a different Ubuntu release or architecture.

## Create Role and Database

`create-database.sh` derives the application role, password, and database name from `DATABASE_URL`, for example:

```text
DATABASE_URL=jdbc:postgresql://industrial_ai:STRONG_PASSWORD@127.0.0.1:5432/industrial_ai
```

Generate a database password with `openssl rand -hex 24`; it remains strong and avoids JDBC URL escaping.

Create or update the native role and database:

```bash
sudo ./database/scripts/create-database.sh /opt/industrial-ai/current/.env
```

The script is idempotent. It creates absent objects and refreshes the existing application role's password.

## Initialize and Migrate

`database/init/` contains the exact ordered SQL source copied from `server-java/src/main/resources/db/migrations/`:

```text
001_production_p0.sql
...
030_mps_menu_permission.sql
```

Apply pending files in lexical order:

```bash
sudo ./database/scripts/apply-migrations.sh /opt/industrial-ai/current/.env
```

The first execution creates `deploy_schema_migration` and records each script's SHA-256. Re-running skips completed migrations. A checksum mismatch stops deployment.

For a pre-existing database already known to contain all 30 migrations, a DBA may register a baseline without executing SQL:

```bash
sudo BASELINE_EXISTING=1 ./database/scripts/apply-migrations.sh /opt/industrial-ai/current/.env
```

Use that option only after a successful backup and manual schema comparison. Never edit files under `database/init/`; replace the release with a new reviewed migration set.

## Verify Database

```bash
sudo ./database/scripts/verify-database.sh /opt/industrial-ai/current/.env
```

Verification checks PostgreSQL 15+, all 30 checksums, 30 recorded migrations, core production/sales/IAM/inventory tables, `gen_random_uuid`, and connectivity through `DATABASE_URL`.

Expected success line:

```text
Database verification passed.
```

Manual inspection commands:

```bash
sudo -u postgres psql
sudo systemctl status postgresql --no-pager
sudo -u postgres /usr/lib/postgresql/16/bin/pg_isready
```

Avoid interactive DDL outside a reviewed migration.
