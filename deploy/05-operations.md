# 05 - 运维、备份与回滚

## 日常健康检查

```bash
systemctl is-active industrial-ai-api postgresql nginx
curl -fsS http://127.0.0.1:5185/healthz
curl -fsS http://127.0.0.1/healthz
sudo -u industrial-ai /opt/industrial-ai/current/scripts/verify-release.sh
```

Java 健康响应应包含 `"status":"ok","runtime":"java"`。

## 日志检查

```bash
sudo journalctl -u industrial-ai-api -n 200 --no-pager
sudo tail -n 200 /opt/industrial-ai/logs/api.log
sudo tail -n 200 /opt/industrial-ai/logs/api.err.log
sudo tail -n 200 /var/log/nginx/access.log
sudo tail -n 200 /var/log/nginx/error.log
```

应将日志发送到集中日志平台；本地文件不能作为唯一留存方式。

## 备份

每次发布或迁移前执行一致性备份：

```bash
sudo systemctl stop industrial-ai-api
sudo -u postgres pg_dump --format=custom \
  --file=/var/backups/postgresql/industrial_ai-$(date +%Y%m%d%H%M%S).dump industrial_ai
sudo systemctl start industrial-ai-api
```

备份文件必须复制到独立存储，并定期在非生产 Ubuntu 主机上演练恢复。至少保留一次早于最新迁移的备份。

应用回滚不会自动回滚数据库。只有按照评审过的恢复流程执行时，才恢复与旧版本匹配的数据库备份。

## 发布回滚

```bash
readlink -f /opt/industrial-ai/current
sudo ln -sfn /opt/industrial-ai/releases/<previous-release-id> /opt/industrial-ai/current
sudo systemctl restart industrial-ai-api
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:5185/healthz
```

如果旧版本需要不同数据库状态，先停止服务，恢复匹配备份，再启动服务。不要把 `current` 指向不完整或未验证的发布目录。

## 变更记录

- 发布前校验压缩包 SHA256。
- 记录发布 ID、Git commit、SHA256、执行人、备份文件名和结果。
- API 启动前先完成数据库校验。
- 每次生产发布后执行浏览器和 API 验收。
- 至少保留上一个发布版本用于回滚。
