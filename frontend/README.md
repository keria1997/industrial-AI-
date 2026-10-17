# 前端模块

React 18、TypeScript、Vite。只负责页面、输入校验和业务 API 对接；AI 请求通过业务后端转发，不在浏览器编写 prompt、执行 RAG 或调用模型。

## 本地运行

在仓库根目录配置 `.env.local`，密钥和口令不提交 Git：

```dotenv
JAVA_API_PORT=8081
VITE_API_PROXY_TARGET=http://127.0.0.1:8081
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/industrial_ai
AUTH_SECRET=replace-with-local-secret
```

从仓库根目录运行：

```bash
npm --prefix frontend install
npm run dev:all
```

单独启动前端：在 `frontend/` 运行 `npm run dev`；单独启动后端：在仓库根目录运行 `npm run dev:java-api`。前端目录的同名命令也会委托根目录脚本，确保后端读取根目录 `.env.local`。

默认前端地址 `http://127.0.0.1:5173/`，业务后端 `http://127.0.0.1:8081/`。Vite 将 `/api/v1` 和 `/api/v2` 转发至业务后端。5173 被占用时 Vite 可选择其他端口，以终端实际地址为准，不要启动多个副本后仍访问旧地址。

## 验证

```bash
npm run typecheck
npm run test:frontend
npm run build
npm run test:remediation
npm run test:live-backend
```

`test:remediation` 等既有浏览器回归使用受控 API 响应，不能替代真实联调。

`test:live-backend` 使用真实登录、Vite 代理、运行中的 Java 服务和 PostgreSQL，要求本机安装 `psql`、Playwright Chromium。读取根目录 `DATABASE_URL`；登录优先使用环境变量 `E2E_ACCOUNT/E2E_PASSWORD`，本地开启演示认证时可使用已有 `DEMO_AUTH_ACCOUNT/DEMO_AUTH_PASSWORD`。仅适用于当前本地 SVG 图形验证码；其他验证码方式需先补测试环境支持，不绕过认证。使用具备本租户全量读取权限的专用账号，避免将合法的数据范围过滤误判为丢数。测试不打印口令或 Token。

```bash
# 创建本轮专用客户：页面新增/编辑 -> SQL 核对 -> 刷新 -> API 删除
LIVE_WRITE=1 npm run test:live-backend
```

默认不写业务数据，写入场景标记跳过；跳过或阻断都会返回非零退出码，不能宣称全量通过。启用 `LIVE_WRITE=1` 只修改新建客户的 UUID，保留真实审计/事件记录，不删除历史业务记录。集合超过200条时当前脚本明确阻断，不用首页冒充全量；后续应扩展完整分页遍历。

迁移台账检查读取本地运行服务对应的 `backend/target/classes/db/migrations/*.sql`，逐份核对数据库记录的文件名和SHA-256；应先构建并启动对应Java服务。仅有台账条数或占位名称不能判定迁移通过。

报告、截图写入 `artifacts/live-integration/`，已排除 Git。报告区分 DB/API 字段核对、API/UI 文本抽样、44个页面及子页签渲染、主数据关联和客户保存持久化；页面渲染通过不代表全部按钮与业务闭环验收。详见 `docs/前后端真实联调报告-2026-10-17.md`。
