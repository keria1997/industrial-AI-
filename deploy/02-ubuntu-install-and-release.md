# 02 - Ubuntu Installation and Release

## Host Requirements

Use Ubuntu Server 24.04 LTS `amd64` with:

- 2 vCPU and 4 GiB RAM minimum; 4 vCPU and 8 GiB RAM recommended.
- 40 GiB system disk plus database storage capacity sized to business growth.
- TCP 80 open to users; do not expose 5185 or 5432 to untrusted networks.
- NTP or systemd-timesyncd enabled.
- Root or sudo access.

The release includes PostgreSQL 16 packages. Java and Nginx are installed from Ubuntu repositories through apt. For a disconnected host, prepopulate an internal Ubuntu mirror or add those archives with the apt-local procedure shown in `03-database.md`.

## Configure Environment

Inside the extracted release directory:

```bash
cp .env.production.example .env
chmod 600 .env
```

Generate production secrets:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # FULFILLMENT_DATA_KEY
openssl rand -hex 24      # database password safe for the JDBC URL
```

Change `AUTH_SECRET`, `FULFILLMENT_DATA_KEY`, the password inside `DATABASE_URL`, and `DEMO_AUTH_PASSWORD`. Keep `DEMO_AUTH_ENABLED=false`, `JAVA_NATIVE_ONLY=true`, and `LEGACY_PROXY_ENABLED=false`.

## Install Application

```bash
sudo ./scripts/install-ubuntu.sh "$(pwd)"
```

The idempotent installer validates the host, installs Java and Nginx, creates the `industrial-ai` account, copies an immutable release under `/opt/industrial-ai/releases/<release-id>/`, installs protected configuration, optionally installs PostgreSQL and initializes the database, then enables and verifies services.

Database controls:

```bash
# Install everything, including PostgreSQL and migrations.
sudo INSTALL_DB=1 RUN_DB_MIGRATIONS=1 ./scripts/install-ubuntu.sh "$(pwd)"

# Use an existing PostgreSQL 15+ host.
sudo INSTALL_DB=0 RUN_DB_MIGRATIONS=0 ./scripts/install-ubuntu.sh "$(pwd)"

# Install PostgreSQL now and let a DBA run migrations in a controlled window.
sudo INSTALL_DB=1 RUN_DB_MIGRATIONS=0 ./scripts/install-ubuntu.sh "$(pwd)"
```

## Verify

```bash
sudo systemctl status industrial-ai-api --no-pager
sudo nginx -t
curl -fsS http://127.0.0.1:5185/healthz
curl -fsS http://127.0.0.1/healthz
sudo -u industrial-ai /opt/industrial-ai/current/scripts/verify-release.sh
```

Then open `http://<server>/` in a browser and sign in with a real production account. Do not rely on demo credentials for acceptance.
