# 生产管理 P0 服务端

本实现对应《生产管理模块 PRD V1.2 P0 开发就绪版》，API 前缀为 `/api/v1/production`。

## 已实现范围

- PostgreSQL P0 全域表结构：生产主数据、需求/MPS/MRP、APS、齐套/库存请求、工单/报工、FQC、成品完工入库、结案、任务、幂等、审计及 Inbox/Outbox。
- 主链路 API：需求受理与审批、工单创建/下达/开停工、报工与更正、FQC 判定及返工/报废、完工入库、库存回调/拒绝重试、结案双人复核、任务和驾驶舱 KPI。
- MRP 与 APS 提供异步任务入口；求解器、平台权限中心、库存、销售和消息队列通过任务/Outbox 契约接入。
- 正式运行使用 PostgreSQL；未设置 `DATABASE_URL` 时启用进程内仓储，仅用于本地联调和自动化测试。

## 启动

```bash
cp server/.env.example server/.env
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

## 网关请求上下文

所有请求必须携带 `X-Tenant-Id`、`X-Actor-Id`。写操作还必须携带 `X-Idempotency-Key`。建议网关同时传递：

- `X-Employee-Id`
- `X-Permissions`：逗号分隔的权限码；`*` 仅用于开发测试
- `X-Permission-Version`
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

接口契约见 `server/docs/openapi.yaml`，数据库迁移见 `server/db/migrations/001_production_p0.sql`。

