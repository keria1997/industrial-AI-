# ISSUE-030：工作台 Logo 图标 403 Forbidden 无法加载

- 级别：P1
- 模块：工作台
- 层级：L4 基础层
- 影响范围：前端, 后端（运维）
- 状态：✅ 已修复（2026-10-17 服务器 chmod 644 修复，所有 PNG 返回 200）

## 问题

工作台页面 Logo 图标消失。浏览器 Console 报错：

```
GET https://erp.wanshen.top/industrial-ai-logo.png 403 (Forbidden)
```

## 原因

服务器上 `/opt/industrial-ai/dist/industrial-ai-logo.png` 文件权限为 `600`（仅 ubuntu 可读写），Nginx worker 进程以 `www-data` 用户运行，无权限读取该文件，返回 403。

根因：macOS `tar czf` 打包时保留了原始文件权限（600），上传到服务器解压后权限不变。Nginx 无法以 `www-data` 身份读取。

同目录其他 PNG 文件可能也存在相同权限问题。

## 方案

| 修改层面 | 文件/位置 | 具体改动 |
|---|---|---|
| 运维 | 服务器 `/opt/industrial-ai/dist/` | `chmod 644 /opt/industrial-ai/dist/*.png` |
| 运维 | 服务器 `/opt/industrial-ai/dist/` | `chmod 755 /opt/industrial-ai/dist/`（目录需要执行权限） |
| 运维 | 部署脚本 | `tar xzf` 后添加 `chmod -R 644 dist/*.png dist/*.html dist/*.js dist/*.css` |

## 验收标准

1. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/industrial-ai-logo.png` 返回 200
2. 浏览器工作台页面 Logo 图标正常显示
3. 所有 PNG/HTML/JS/CSS 文件权限为 644

## 进展

✅ 已修复（2026-10-17 服务器 chmod 644 修复，所有 PNG 返回 200）

## 修复记录

- **修复日期**：2026-10-17
- **修复方式**：服务器上 `chmod 755 dist/` + `chmod 644 dist/*.png dist/*.html dist/*.js dist/*.css`
- **验证结果**：所有 PNG 文件通过 HTTPS 返回 200

### 预防措施

在部署脚本的 `tar xzf` 后添加：
```bash
chmod -R 755 dist/
find dist/ -type f -exec chmod 644 {} \;
```
