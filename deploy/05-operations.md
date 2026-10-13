# 05 - Operations, Backup, and Rollback

## Daily Health Check

```bash
systemctl is-active industrial-ai-api postgresql nginx
curl -fsS http://127.0.0.1:5185/healthz
curl -fsS http://127.0.0.1/healthz
sudo -u industrial-ai /opt/industrial-ai/current/scripts/verify-release.sh
```

The Java health response contains `"status":"ok","runtime":"java"`.

## Logs

```bash
sudo journalctl -u industrial-ai-api -n 200 --no-pager
sudo tail -n 200 /opt/industrial-ai/logs/api.log
sudo tail -n 200 /opt/industrial-ai/logs/api.err.log
sudo tail -n 200 /var/log/nginx/access.log
sudo tail -n 200 /var/log/nginx/error.log
```

Ship logs to the central log platform; do not use local files as the only retention layer.

## Backup

```bash
sudo systemctl stop industrial-ai-api
sudo -u postgres pg_dump --format=custom \
  --file=/var/backups/postgresql/industrial_ai-$(date +%Y%m%d%H%M%S).dump industrial_ai
sudo systemctl start industrial-ai-api
```

Take a backup before every release or migration. Copy dumps to separate storage and periodically test restore on a non-production Ubuntu host.

Application rollback does not automatically roll back the database. Restore the matching backup only through the reviewed recovery procedure.

## Release Rollback

```bash
readlink -f /opt/industrial-ai/current
sudo ln -sfn /opt/industrial-ai/releases/<previous-release-id> /opt/industrial-ai/current
sudo systemctl restart industrial-ai-api
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:5185/healthz
```

If the previous release expects a different database state, stop first, restore its matching backup, then start the service. Never activate a partial or unverified release.
