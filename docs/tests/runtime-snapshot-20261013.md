# 当前前后端版本留存

快照标识：`runtime-20261013-191228`。
运行状态检查时间：2026-10-13 19:12，Asia/Shanghai。

## 实际运行配置

| 项目 | 确认结果 |
| --- | --- |
| 源码目录 | `/Users/liyi/Desktop/projects1/gongye_ai_plat` |
| 前端 | React/Vite，`http://127.0.0.1:5175`，PID 32966 |
| 前端响应 | 首页 HTTP 200 |
| 后端 | Java/Spring Boot，`http://127.0.0.1:8081`，PID 36345 |
| 后端健康检查 | `/healthz` 返回 `status=ok`、`runtime=java` |
| 前端代理 | `.env.local` 中 `VITE_API_PROXY_TARGET=http://127.0.0.1:8081` |
| 代理连通性 | 5175 的 `/api/v1/production/demands` 返回 HTTP 401，未提供登录凭据 |
| 8001 端口 | 检查时无监听进程，HTTP 连接失败 |
| 其他后端 | PID 39113 监听 8082，作为独立测试实例记录 |

## 保存范围

- Git 提交保存当前前端、Java 后端、数据库迁移、测试、文档和部署脚本，包含当前工作区已有修改及旧 Node 后端的删除状态。
- 本地备份：`/Users/liyi/Desktop/projects1/backups/gongye-ai-20261013-191228/runtime-snapshot.tar.gz`。
- 本地备份包含快照时的源码、`.env.local`、现有前端构建目录、Java `target` 编译产物和已有部署包；排除 `.git`、`node_modules`、日志和缓存。
- 本地备份是本次整理说明和 Git 留存规则之前的工作区副本。Git 提交另包含这些说明。
- 另保存验证后构建的前端 `dist` 和 Java 可执行 JAR：同目录的 `verified-artifacts.tar.gz`。
- 数据库中的业务数据和浏览器本地存储不在本次代码快照范围内。
- Java 编译产物来自运行进程使用的 `target` 路径；未读取 JVM 内存中的已加载类，不能据此证明所有已加载类与磁盘源码逐字对应。

## 恢复方式

从快照标签检出源码到单独目录，安装 `package-lock.json` 对应的依赖，
恢复本地 `.env.local` 配置，并准备原有 PostgreSQL 数据库后执行：

```bash
npm ci
npm run dev:all
```

本次记录的端口为前端 5175、后端 8081。该方式依赖原有数据库状态。
本地备份含运行配置，应继续保存在本机，不直接上传远程仓库。

## 验证与远程状态

验证在 `/private/tmp/gongye-ai-verify-20261013-191228` 的快照副本中执行，
不覆盖正在运行的项目构建目录。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run test:frontend` | 24 个测试文件、117 项测试通过 |
| `npm run test:routes:java` | 261 条路由与基线一致 |
| `npm run build` | 通过；存在既有大包和混合导入警告 |
| `mvn -f server-java/pom.xml -o test` | 73 项测试，67 项通过，6 项跳过，无失败和错误 |
| `mvn -f server-java/pom.xml -o -DskipTests package` | 测试通过后构建可执行 JAR 成功 |
| 真实数据库测试 | 未设置相应 JDBC 测试环境，6 项跳过 |
| `git diff --check` | 发现 `src/App.tsx` 既有行尾空格，本次原样保存 |

项目未配置 Git 远程仓库；本次先保存本地提交和标签，远程推送需要仓库地址。
