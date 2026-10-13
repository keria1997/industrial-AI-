# 04 - Configuration Reference

## Archived Files

| File | Destination | Purpose |
| --- | --- | --- |
| `.env.production.example` | `/opt/industrial-ai/releases/<id>/.env` | Secrets, database URL, ports, and runtime switches |
| `config/application.properties` | inside executable JAR | Backend defaults; environment variables override defaults |
| `config/nginx/industrial-ai.conf` | `/etc/nginx/sites-available/industrial-ai.conf` | Static frontend, SPA fallback, and API proxy |
| `config/systemd/industrial-ai-api.service` | `/etc/systemd/system/industrial-ai-api.service` | Java process lifecycle and hardening |

The effective backend configuration is the archived properties file plus the protected environment file loaded by systemd.

## Runtime Values

| Variable | Required | Production guidance |
| --- | --- | --- |
| `PRODUCTION_API_HOST` | yes | `127.0.0.1` when Nginx is on the same host |
| `PRODUCTION_API_PORT` | yes | `5185`; keep it firewalled from clients |
| `DATABASE_URL` | yes | JDBC URL with a least-privilege application role |
| `AUTH_SECRET` | yes | 48-byte random Base64 value |
| `FULFILLMENT_DATA_KEY_ID` | yes | Stable key identifier such as `prod-v1` |
| `FULFILLMENT_DATA_KEY` | yes | Base64-encoded 32-byte key |
| `JAVA_NATIVE_ONLY` | yes | `true`; prevents accidental legacy proxy behavior |
| `LEGACY_PROXY_ENABLED` | yes | `false` |
| `DEMO_AUTH_ENABLED` | yes | `false`; never expose demo credentials |

Additional pool and worker variables are documented inline in `.env.production.example`. Keep worker discovery enabled for the normal single-process deployment.

## Service Paths

```text
/opt/industrial-ai/releases/<release-id>/     Immutable release content
/opt/industrial-ai/current                    Symbolic link to active release
/opt/industrial-ai/logs/api.log               Standard output
/opt/industrial-ai/logs/api.err.log          Standard error
/etc/nginx/sites-available/industrial-ai.conf Nginx site
/etc/systemd/system/industrial-ai-api.service Java unit
```

`.env` is mode `600` and owned by `industrial-ai:industrial-ai`. Release code is readable by the service account but not writable by it.

## Nginx Behavior

- `/` serves `/opt/industrial-ai/current/app/dist`.
- `/assets/` uses immutable one-year caching because Vite emits hashed filenames.
- `/api/v1/` proxies to `127.0.0.1:5185`.
- `/healthz` proxies to the Java health endpoint.
- Unknown SPA paths return `index.html`.
- Request body limit is 25 MiB; API timeout is 300 seconds.

For TLS, terminate at Nginx on port 443 and redirect port 80. Keep API and PostgreSQL listeners on loopback or a private network.
