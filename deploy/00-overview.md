# 00 - Deployment Overview

## Scope

This directory is the complete Ubuntu deployment kit for the Industrial AI Platform. It contains the frontend build, Java API runtime, PostgreSQL software packages, database initialization and verification scripts, runtime configuration templates, and step-by-step execution documents.

Target baseline:

- Ubuntu Server 24.04 LTS, `amd64`.
- PostgreSQL 16.2 (offline `.deb` bundle included).
- Java 17 JRE.
- Nginx.
- Frontend: React 18 / Vite 7.
- Backend: Spring Boot 3.3 / Java 17.

No Docker, Podman, Kubernetes, or other container runtime is required.

## Directory Map

```text
deploy/
  00-overview.md                     Entry document and package map
  01-build-and-package.md           Compile, test, package, checksum
  02-ubuntu-install-and-release.md  Host installation and release flow
  03-database.md                    PostgreSQL, initialization, verification
  04-configuration.md               Runtime configuration archive
  05-operations.md                  Health checks, backup, rollback
  .env.production.example           Editable production environment template
  scripts/build-release.sh          Build a complete release archive
  scripts/install-ubuntu.sh         Install one release on Ubuntu
  scripts/verify-release.sh         API, frontend, service, and database checks
  config/application.properties     Backend configuration archived from source
  config/nginx/industrial-ai.conf   Nginx frontend and API reverse proxy
  config/systemd/industrial-ai-api.service Java API service
  database/packages/ubuntu-24.04-amd64 PostgreSQL 16 .deb dependency closure
  database/init/001...030.sql       Ordered database initialization scripts
  database/scripts/                 Database install, init, migration, verify
```

Build archives and generated release packages are written to `deploy/artifacts/`. That directory is intentionally ignored by Git; it is transport output, not source of truth.

## Recommended Flow

1. Run `deploy/scripts/build-release.sh` on a macOS/Linux build host with Node.js 20+, npm, Java 17, and Maven.
2. Copy the generated `.tar.gz` and `.tar.gz.sha256` to the Ubuntu host.
3. Verify the archive checksum and extract it.
4. Copy `.env.production.example` to `.env` in the extracted release and change every `change-me` value.
5. Run `sudo ./scripts/install-ubuntu.sh <extracted-release-directory>`.
6. Run `/opt/industrial-ai/current/scripts/verify-release.sh`.

For database-only operations, read `03-database.md`; do not execute SQL by hand except during a controlled recovery.
