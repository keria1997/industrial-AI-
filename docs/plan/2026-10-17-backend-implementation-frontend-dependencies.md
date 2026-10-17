# 后端实施结果与前端依赖清单

- 日期：2026-10-17。
- 后端代码基线：本文件生成时包含 Workbench、Finance、RMA/Receipt/Completion、Platform、Production、Auth 的整改。
- 约束：本轮未修改 `frontend/` 源码。下表是前端接入前必须对齐的后端契约和联调依赖。

## 1. 后端已实施能力

| 编号 | 后端能力 | 说明 |
| --- | --- | --- |
| B-01/B-02 | Workbench 1.1 | 返回 `schemaVersion=1.1` + `data`；`role` 只作展示分组；tenant-wide 动态由 `*` 权限推导；消息过滤移除 50 条硬上限；游标携带租户/用户；移除考勤指标；订单金额可投影，确认收入和发货确权因正式事实源缺失返回 `UNAVAILABLE`，不再伪造零值 |
| B-03 | Finance confirmation/allocation | 收款/付款登记不扣 AR/AP；确认直接引用单据时生成系统 `Allocation`；AR/AP 只由 Allocation 更新；独立核销累计校验 Payment 剩余额度和单据剩余可核销额度 |
| B-04 | Finance reversal | Payment 冲销先保存反向事实，再根据 active Allocation 反向恢复 AR/AP；Allocation 标记 `REVERSED`；不再依赖已覆写的旧 Payment 状态判断余额恢复 |
| B-05 | RMA 状态机 | `REQUESTED -> REJECTED` 可达并记录 `rejectedReason/rejectedAt`；REJECTED 不占用可退额度；红字 AR 增加旧 `taxBasis` 金额兼容，但仍要求 lines 和原 AR 校验 |
| B-06 | Customer receipt | 首次登记强制 `signed + rejected + damaged = shipped` 且覆盖已发订单行；新增 `PATCH /sales-orders/{orderId}/receipts/{receiptId}` 增量补签/差额处理；`receiptStatus` canonical |
| B-07 | Sales completion | 检查全部同源 AR；支持订单要求时校验 REQUIRED 发票和凭证；签收、RMA/争议条件保留；新增签收更新命令 |
| B-08 | Platform | `/platform/permissions` 返回权限目录；资源迁到 `/platform/permission-resources`；`/platform/audits` 返回准确 total/hasMore；外部适配器未配置时返回 `NOT_CONFIGURED`，不假报 synced |
| B-09 | Production completion preview | 返回 factory、work center、inventory warehouse、traceMode、allocationRevision、businessDate、sourceVersions、缺失原因；completion 校验 revision 和 traceMode |
| B-12 | Auth | 新增 `auth_email_code` 和 `auth_login_lock`；邮箱验证码从内存迁 PostgreSQL；验证码只存哈希并一次性消费；连续 5 次失败锁 15 分钟；密码至少 10 位且包含大小写与数字 |
| 公共契约 | Idempotency-Key | RequestContext 优先读取 canonical `Idempotency-Key`，继续兼容 `X-Idempotency-Key` |

## 2. 前端必须接入的接口变化

### 2.1 工作台

| 项 | 前端依赖 |
| --- | --- |
| 响应解析 | 只解析 `{schemaVersion:"1.1",data,error}`；不要再把 1.1 顶层对象当合法响应 |
| 指标 | 从 `data.metrics.orderAmount`、`confirmedRevenueAmount`、`shippedRecognizedAmount` 读取可用性和值；`UNAVAILABLE` 显示“-/数据待接入”，不得补 0 |
| 列表 | 读取 `data.todos.items/total/hasMore`、`data.alerts.items/total/hasMore`、`data.activities.items/hasMore/nextCursor/eventCatalogVersion` |
| role | `role` 只是展示分组；不得请求“老板”期待扩大数据范围。后端 scope 来自签名身份 |
| 游标 | 首次刷新不带 cursor；加载更多才带 `data.activities.nextCursor`；400 invalid cursor 时重置第一页 |
| 来源状态 | 读取 `data.sources[]`，展示订单、确认收入、发货确权、消息的可用性 |

### 2.2 财务

| 项 | 前端依赖 |
| --- | --- |
| 确认 | `POST /finance/payments/{id}/confirm` 响应新增 `allocation`。确认直接引用 AR/AP 时展示“已确认并生成系统核销事实”，不能再展示“确认后待人工核销” |
| 核销 | `POST /finance/allocations` 前端需传 Payment 当前剩余可核销额；后端会对 Payment 和 AR/AP 双向累计校验。400 的 suggestion 包含剩余额度 |
| 冲销 | `POST /finance-documents/{id}/reverse` 后会反向核销 Allocation 并恢复 AR/AP。页面刷新后必须读取 Payment、Allocation、AR/AP 三方状态；不要用请求前快照推断成功 |
| 状态 | 当前存量仍使用小写 `pending/processing/done/reversed`，新 Allocation 使用 `CONFIRMED/REVERSED`。前端保留兼容映射，但不得反向提交旧枚举作为新事实 |

### 2.3 RMA 与客户签收

| 项 | 前端依赖 |
| --- | --- |
| 驳回 | `transition=APPROVE`、`toStatus=REJECTED`、`decision=REJECTED`、`comment`。成功后展示驳回原因，不再判定为非法状态 |
| 签收创建 | 每行 `signedQty + rejectedQty + damagedQty` 必须精确等于后端返回的 `shippedQty`；未覆盖全部已发订单行会 422 |
| 签收补录 | `PATCH /api/v1/sales-orders/{orderId}/receipts/{receiptId}`，body 传增量行的 `orderLineId` 和新的 `signedQty/rejectedQty/damagedQty` 终值；幂等命令类型为 `RECEIPT_SUPPLEMENT` |
| RMA 红字 | 建议改传 `creditAmount` 表达金额；`taxBasis` 后续必须转为枚举。当前兼容入口仍接受旧 `taxBasis` 金额，但前端不应继续扩散旧语义 |
| 销售完成 | 完成检查可能新增 `REQUIRED发票已开具`、`REQUIRED凭证已过账`。前端需逐项展示 missingConditions，不能合并成“前置条件未满足” |

### 2.4 平台

| 项 | 前端依赖 |
| --- | --- |
| 权限目录 | `GET /api/v1/platform/permissions` 现在是权限目录；资源列表改用 `GET /api/v1/platform/permission-resources` |
| 审计 | `GET /api/v1/platform/audits` 返回 `items,total,hasMore,page,pageSize`；total 不再是估算。筛选参数仍是 `startTime/endTime` |
| 适配器 | `PUT /api/v1/platform/adapters/{id}` 或同步入口返回 `NOT_CONFIGURED` 时不能显示“同步成功”；必须提示未配置外部端点 |
| 会话撤销 | 撤销仍必须传真实 `account + jti + reason`。当前后端尚无活跃会话目录，前端不得枚举猜测 jti |

### 2.5 生产完工

| 项 | 前端依赖 |
| --- | --- |
| 预览 | 调用 `POST /production/work-orders/{id}/completion-allocation-preview` 后必须读取 `factoryId/workCenterResourceId/inventoryWarehouseId/traceMode/allocationRevision/businessDate/missingSources/sourceVersions` |
| 写入 | `POST /production/work-orders/{id}/completions` 必须提交预览返回的 `traceMode` 和 `allocationRevision`；预览 `UNAVAILABLE` 时禁用写按钮 |
| 修订 | 每次完工任务（含 POSTING/FAILED）都会推进下一个 revision。重试前重新读取 completion 当前任务，不要复用旧 revision 发起新 completion |

### 2.6 认证

| 项 | 前端依赖 |
| --- | --- |
| 密码 | 注册、忘记密码重置、首次改密都要求至少 10 位且含大小写字母和数字。前端错误文案需同步 |
| 锁定 | 连续 5 次密码失败后 15 分钟账号级锁定；前端展示锁定提示，不做“换 IP 可重试”暗示 |
| 邮箱验证码 | 后端验证码已入库且一次性消费；页面刷新后不得复用旧 code。注册成功响应仍不含 token，前端应跳转登录页 |
| 响应头 | 优先发送 `Idempotency-Key`；可以暂存 `X-Idempotency-Key` 兼容，但新代码统一 canonical |

## 3. 明确留给下一轮的后端依赖

| 项 | 当前状态 | 前端处理 |
| --- | --- | --- |
| 活跃会话目录 | 未实现；只能按已知 jti 撤销 | 不开放“查询全部会话并一键撤销”的假能力 |
| 确认收入 / 发货确权事实 | Workbench 返回 `UNAVAILABLE/SOURCE_MISSING` | 指标显示不可用，等待事实模型和集成事实写入后再接 |
| RMA 红字行级金额 | 仍校验原 AR 聚合，未完全按原发货确权行自动重算 | 只允许展示和服务端返回金额，不得前端用数量反推终局金额 |
| 关闭检查 ID | 当前仍接受外部 `closureCheckId` 并校验财务/库存条件 | 不自造 ID；等待服务端 closure-check 契约后替换 |
| 外部适配器真实同步 | 未配置端点返回 `NOT_CONFIGURED` | 不把受理或本地标记当外部成功 |
| Workbench event catalog 独立表 | 当前仍从 Message projection 过滤，目录版本已返回 | 按目录展示 KEY/ALL；不要把非目录消息混入 |

## 4. 建议前端接入顺序

1. Workbench 1.1 projection、来源状态、游标。
2. Finance 确认/核销/冲销三方事实刷新。
3. RMA 驳回 + 签收创建/补录 + 销售完成差异。
4. Production 完工预览强制来源。
5. Platform 权限目录/资源路径、审计 total。
6. Auth 密码、锁定、注册后跳登录、canonical 幂等头。

## 5. 验收提示

前端模拟拦截只能验证协议；Finance、RMA、签收、生产完工必须做页面 -> API -> PostgreSQL -> 刷新回读核对。所有 `UNAVAILABLE`、`NOT_CONFIGURED`、`POSTING`、`DISPUTED` 不得渲染为成功或零值。
