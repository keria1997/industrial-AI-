# 01 - Build and Package

## Build Host Requirements

- Node.js 20 or later and npm 10 or later.
- Java Development Kit 17.
- Apache Maven 3.9 or later.
- GNU `tar`, `sha256sum` or `shasum`, and Bash 4 or later.
- Network access to npm and Maven repositories unless a local mirror or warmed cache is available.

Run all commands from the `gongye_ai_plat` project root.

## One-command Release

```bash
chmod +x deploy/scripts/*.sh deploy/database/scripts/*.sh
./deploy/scripts/build-release.sh
```

The script performs these steps in order:

1. Cleans Node and Maven outputs.
2. Installs locked frontend dependencies with `npm ci`.
3. Runs TypeScript checking and frontend Vitest suites.
4. Builds the frontend into `dist/`.
5. Verifies Java route definitions.
6. Runs backend Maven tests and packages the executable JAR.
7. Assembles `app/`, `config/`, `scripts/`, `database/`, and the environment template.
8. Creates `MANIFEST.txt`, `MANIFEST.sha256`, a release tarball, and a checksum.

Output names use this pattern:

```text
deploy/artifacts/industrial-ai-0.1.0-YYYYMMDDHHMMSS.tar.gz
deploy/artifacts/industrial-ai-0.1.0-YYYYMMDDHHMMSS.tar.gz.sha256
```

To skip tests only for a controlled emergency build, use `SKIP_TESTS=1`. Emergency artifacts must be marked in the release record and rebuilt with tests before normal use.

## Manual Equivalent

```bash
npm ci
npm run typecheck
npm run test:frontend
npm run build
npm run test:routes:java
mvn -f server-java/pom.xml package
```

The frontend output is `dist/`; the backend output is `server-java/target/industrial-ai-api-0.1.0.jar`.

## Transfer to Ubuntu

```bash
sha256sum -c deploy/artifacts/industrial-ai-0.1.0-*.tar.gz.sha256
scp deploy/artifacts/industrial-ai-0.1.0-*.tar.gz* user@ubuntu-host:/tmp/
mkdir -p /tmp/industrial-ai-release
tar -xzf /tmp/industrial-ai-0.1.0-*.tar.gz -C /tmp/industrial-ai-release --strip-components=1
```

The archive contains the PostgreSQL package bundle, so it is larger than the application alone.
