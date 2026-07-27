# 生产管理 P0 与首期履约服务端

本实现源自《生产管理模块 PRD V1.2 P0 开发就绪版》，现作为《工业AI平台 V2.1.0 需求规格说明书》的生产域后端基线，API 前缀为 `/api/v1/production`。

## 已实现范围

- PostgreSQL P0 全域表结构：生产主数据、需求/MPS/MRP、APS、齐套/库存请求、工单/报工、FQC、成品完工入库、结案、任务、幂等、审计及 Inbox/Outbox。
- 主链路 API：需求受理与审批、工单创建/下达/开停工、报工与更正、FQC 判定及返工/报废、完工入库、库存回调/拒绝重试、结案双人复核、任务和驾驶舱 KPI。
- MRP 与 APS 提供异步任务入口；求解器、平台权限中心、库存、销售和消息队列通过任务/Outbox 契约接入。
- 正式运行使用 PostgreSQL；未设置 `DATABASE_URL` 时启用进程内仓储，仅用于本地联调和自动化测试。
- 首期履约 API：销售订单/审批/发货申请、库存组成事实、原子预留、缺口生产需求、完工事件、重校验、部分/全量出库和履约追踪。
- `ReferenceWmsAdapter` 与 `ReferenceEventPublisher` 只用于开发和自动化测试，不是客户 WMS 或消息队列集成证明。

## 启动

```bash
cp server/.env.example server/.env
export AUTH_SECRET='replace-with-a-long-random-secret'
export FULFILLMENT_DATA_KEY="$(openssl rand -base64 32)"
export DATABASE_URL='postgresql://...'
npm run db:migrate:production
npm run start:api
```

本地无数据库验证：

```bash
npm run start:api
npm run test:api
```

服务默认监听 `http://127.0.0.1:5185/api/v1/production`。
若本地端口冲突，可同时设置 `PRODUCTION_API_PORT` 和前端的 `VITE_API_PROXY_TARGET` 指向新端口。

## 会话与请求上下文

业务请求必须携带 `Authorization: Bearer <token>`，并通过 `X-Tenant-Id` 选择令牌已授权的租户。账号、权限和权限版本只从签名声明读取，浏览器提交的 `X-Actor-Id`、`X-Permissions` 等头不会被信任。写操作还必须携带 `X-Idempotency-Key`。

本地开发可调用 `POST /api/v1/session/login`，内置账号为 `admin`、`reviewer`、`operator`、`inspector`，默认密码为 `123456`。可用 `DEMO_AUTH_ACCOUNT`、`DEMO_AUTH_PASSWORD` 和 `DEMO_AUTH_ENABLED` 调整；生产环境始终禁用该演示登录，且未配置 `AUTH_SECRET` 时拒绝启动。当前实现没有刷新令牌、服务端撤销和企业 SSO/OIDC，不能视为正式统一身份中心。

其他上下文头：

- `X-Trace-Id`
- `If-Match`：修改命令使用查询返回的 ETag/版本号
- `X-Production-Capability`：`disabled` 阻断未开通租户，`unavailable` 表示平台校验不可用

## 关键一致性规则

1. 所有数量经 `decimal(18,6)` 字符串传输，业务运算使用整数缩放，避免浮点误差。
2. 报工累计 `合格 + 不良 + 报废` 不得超过累计投入与计划上限。
3. FQC 未 `PASSED` 禁止完工；`DISPOSITION_PENDING` 只能进入返工复检或审批报废。
4. 完工创建后处于 `POSTING`。库存结果未知时继续保持 `POSTING`；明确拒绝才进入 `FAILED`。
5. 库存拒绝重试复用原 `inventoryIdempotencyKey`，不创建第二笔完工事实。
6. 只有库存返回唯一流水后完工才转 `POSTED`，同时更新工单完工量、确定性销售分配和 Outbox。
7. 结案提交人与复核人必须为不同账号；存在未关闭 FQC、投退料或完工任务时禁止结案。
8. 业务状态、审计快照与 Outbox 和业务事实在同一数据库事务内提交。
9. PostgreSQL 表启用 RLS，仓储层的每条查询也显式包含 `tenant_id`。

## 权限码

- `production.demand.create/review/approve`
- `production.work-order.create/release/start/pause/report/report.correct`
- `production.quality.inspect/disposition`
- `production.completion.post/retry`
- `production.inventory.callback`
- `production.close.submit/approve`
- `production.mrp.run`、`production.aps.run`

接口契约见 `server/docs/openapi.yaml`，数据库迁移见 `server/db/migrations/001_production_p0.sql` 至 `006_production_fulfillment_link.sql`。
