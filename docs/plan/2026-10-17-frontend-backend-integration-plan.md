# 前后端联调计划书

日期：2026-10-17
状态：待执行
范围：销售履约、库存主数据、财务核销冲销、Platform 管理回归、Workbench schema 1.1 回归。
目标：基于已完成后端契约和现有前端能力，完成剩余前后端联调，使 PRD P0 业务闭环从“后端接口可用”推进到“页面、API、数据库三方一致”。
边界：本文为联调执行计划，不改变已完成的后端接口契约，不绕过 PRD 状态机，不用本地数据或假成功替代服务端事实。

## 1. 当前基线

### 1.1 已完成后端能力

后端已具备以下能力，并通过契约测试：

1. **销售履约命令**
   - `POST /api/v1/rmas`
   - `POST /api/v1/rmas/{id}/transition`
   - `POST /api/v1/sales-orders/{orderId}/receipts`
   - `POST /api/v1/sales-orders/{orderId}/complete-check`
   - `POST /api/v1/sales-orders/{orderId}/complete`
   - `GET /api/v1/fulfillment/rmas`
   - `GET /api/v1/fulfillment/customer-receipts`

2. **库存主数据默认仓库**
   - 产品和物料支持 `defaultWarehouseId`。
   - 产品新增允许不关联仓库。
   - 关联仓库时校验存在、启用、授权和版本。
   - 前端产品关联已部分接通，物料前端待完成。

3. **Finance 闭环**
   - `GET /api/v1/finance/ar-aps`
   - `GET /api/v1/finance/allocations`
   - `POST /api/v1/finance/allocations`
   - `POST /api/v1/finance/finance-documents/{id}/reverse`
   - `POST /api/v1/finance-documents/{id}/reverse`

4. **Workbench schema 1.1**
   - `date`
   - `eventScope=KEY/ALL`
   - `todoLimit`
   - `activityLimit`
   - `cursor`
   - `schemaVersion=1.1`

5. **Platform 兼容接口**
   - `/tenant`
   - `/permissions`
   - `/role-grants`
   - `/permission-adapters`
   - `/permission-adapters/{id}/sync`
   - `/audits`
   - `/capabilities/{code}`
   - `/parameters/security`

### 1.2 已完成前端能力

前端已完成：

1. 销售 RMA 列表读取。
2. 客户签收列表读取。
3. 订单来源穿透。
4. 空态、失败态、分页和权限展示。
5. 产品新增/部分编辑的默认仓库关联。
6. Production 前端报工、完工、结案路径迁移。
7. Workbench 查询参数 client 已支持。

### 1.3 尚未完成前端能力

前端仍需完成：

1. RMA 创建和状态流转。
2. 客户签收登记。
3. 销售完成检查和完成关闭。
4. Finance AR/AP 聚合台账、核销、冲销。
5. 物料默认仓库选择和保存。
6. Platform 账号状态和密码重置路径归一。
7. Workbench cursor 分页和关键事件过滤的页面回归。

## 2. 总体设计

### 2.1 调用边界

```text
前端页面
  → 前端 API Client
    → Java 业务后端
      → 模块 Store / 领域服务 / 财务域 / 库存域
      → AI 服务
```

前端禁止直连 AI 服务、数据库或其他租户后端。所有业务命令必须通过 Java 业务后端完成。

### 2.2 命令规范

所有写接口必须携带：

| 请求头 / 参数 | 要求 |
| --- | --- |
| `Authorization: Bearer <token>` | 必填 |
| `X-Tenant-Id: <tenant_id>` | 必填 |
| `X-Trace-Id: <trace_id>` | 建议必填 |
| `X-Idempotency-Key: <key>` | 所有命令必填 |
| `If-Match: <version>` | 聚合更新必填 |

前端提交失败时必须保留草稿；提交成功后必须重新读取服务端事实。禁止根据本地临时对象提示最终成功。

### 2.3 错误处理

前端按以下通用规则处理：

| 状态 | 页面处理 |
| --- | --- |
| 400 | 展示字段错误或后端 `suggestion` |
| 401 | 清理会话并跳转登录 |
| 403 | 禁用动作或展示无权限 |
| 404 | 清空旧结果并提示记录不存在 |
| 409 | 展示状态/版本/幂等冲突，刷新后重试 |
| 422 | 展示业务校验原因 |
| 5xx | 保留输入并展示可重试错误 |

### 2.4 后端一致性设计

后端继续按以下原则执行：

1. Controller 只做协议转换。
2. Application Service 负责状态机、权限、租户、幂等、版本和业务守卫。
3. Store 负责租户隔离持久化和事实版本。
4. 跨模块动作使用 Correlation ID、Outbox/Inbox、补偿或显式服务调用。
5. 财务红字、库存回入库、销售完成等必须可追溯。
6. 历史单据不得被自动改写。

## 3. 前端联调范围

### 3.1 销售履约

前端需新增或调整销售履约命令 API 和页面动作。

#### RMA 创建

调用：

```http
POST /api/v1/rmas
```

前端提交：

```json
{
  "orderId": "so-001",
  "outboundId": "outbound-001",
  "outboundLineId": "outbound-line-001",
  "requestedQty": "3",
  "reason": "客户收到破损品",
  "evidence": [
    { "label": "照片", "value": "https://example.com/evidence.jpg" }
  ]
}
```

验收：

1. 缺少来源行、数量、原因或证据时阻止提交。
2. 超过可退余额返回 422。
3. 创建成功后刷新列表。
4. 创建时 `approvedQty` 必须为空。

#### RMA 状态流转

调用：

```http
POST /api/v1/rmas/{id}/transition
```

前端按状态展示动作：

| 当前状态 | 动作 | 目标状态 |
| --- | --- | --- |
| `REQUESTED` | `APPROVE` | `APPROVED` / `REJECTED` |
| `APPROVED` | `TRANSIT_UPDATE` | `IN_TRANSIT` |
| `IN_TRANSIT` | `RECEIVE` | `RECEIVED` |
| `RECEIVED` | `START_INSPECTION` | `INSPECTING` |
| `INSPECTING` | `INSPECT` | `INSPECTION_COMPLETED` |
| `INSPECTION_COMPLETED` | `RESTOCK` | `RESTOCKED` |
| `INSPECTION_COMPLETED` / `RESTOCKED` | `CREDIT_NOTE` | 保持当前状态并生成红字 AR |
| `RESTOCKED` 或满足关闭条件 | `CLOSE` | `CLOSED` |

页面必须分开展示：

1. 稳定 ID：`id`。
2. 展示编号：`rmaNo`。
3. 状态：`status`。
4. 数量：`requestedQty`、`approvedQty`、`receivedQty`、`qualifiedQty`、`reworkQty`、`scrapQty`。
5. 红字引用：`creditNoteFinanceId`。
6. 版本：`version`。

#### 数量守恒

前端提交前校验：

```text
qualifiedQty + reworkQty + scrapQty = receivedQty
receivedQty <= approvedQty
```

最终以后端校验为准。前端不能隐藏后端错误。

### 3.2 客户签收

调用：

```http
POST /api/v1/sales-orders/{orderId}/receipts
```

前端提交行级数据：

```json
{
  "signedBy": "客户签收人",
  "signedAt": "2026-10-17T10:00:00Z",
  "evidence": [],
  "lines": [
    {
      "orderLineId": "line-001",
      "outboundId": "outbound-001",
      "outboundLineId": "outbound-line-001",
      "signedQty": "8",
      "rejectedQty": "1",
      "damagedQty": "1",
      "remark": "1 件破损"
    }
  ]
}
```

前端不提交 `shippedQty`。已发数量必须来自服务端出库事实。

状态展示：

| 状态 | 含义 |
| --- | --- |
| `PENDING` | 未签收 |
| `PARTIALLY_SIGNED` | 部分签收 |
| `SIGNED` | 全部正常签收 |
| `REJECTED` | 拒收 |
| `DISPUTED` | 存在破损或争议 |

### 3.3 销售完成

完成检查：

```http
POST /api/v1/sales-orders/{orderId}/complete-check
```

完成关闭：

```http
POST /api/v1/sales-orders/{orderId}/complete
```

前端展示：

1. `canComplete`
2. `missingConditions`
3. `receiptId`
4. `arAllocationCheckId`
5. `closureFactId`

关闭条件：

1. 全部订单行已发货。
2. 客户签收完成。
3. AR 已结算。
4. 无未关闭 RMA/争议。
5. 版本未冲突。

### 3.4 库存默认仓库

产品已完成部分能力，物料仍需接通。

调用：

```http
POST /api/v1/inventory/materials
PATCH /api/v1/inventory/materials/{id}
```

前端提交：

```json
{
  "code": "MAT-001",
  "name": "原材料",
  "materialType": "原材料",
  "uom": "PCS",
  "safetyStockQty": "10",
  "status": "active",
  "defaultWarehouseId": "warehouse-server-id"
}
```

规则：

1. 选项只能来自后端授权仓库。
2. 只允许选择启用仓库。
3. 提交使用仓库服务端 ID。
4. 历史未配置显示“未关联”。
5. 不得用库存事实反推默认仓库。
6. 修改默认仓库不触发库存搬移。

### 3.5 Finance 核销与冲销

#### AR/AP 聚合查询

调用：

```http
GET /api/v1/finance/ar-aps
```

前端展示：

1. `documentType`
2. `financeId`
3. `partyName`
4. `currency`
5. `totalAmount`
6. `allocatedAmount`
7. `outstandingAmount`
8. `status`

#### 核销

调用：

```http
POST /api/v1/finance/allocations
```

请求示例：

```json
{
  "paymentId": "payment-001",
  "remark": "订单收款核销",
  "lines": [
    {
      "documentType": "RECEIVABLE",
      "documentId": "ar-001",
      "amount": "100"
    }
  ]
}
```

规则：

1. 只有已确认收付款单可以核销。
2. 币种必须一致。
3. 核销金额不能超过原单未结余额。
4. 核销后重新读取 AR/AP。

#### 冲销

调用：

```http
POST /api/v1/finance-documents/{id}/reverse
```

请求示例：

```json
{
  "reason": "录入错误",
  "approverToken": "finance-approver-token"
}
```

支持冲销：

1. Payment。
2. Receivable。
3. Payable。
4. Voucher。

冲销后原单状态为 `REVERSED`，并生成 `reverseFinanceId`。

### 3.6 Platform

当前已补后端兼容接口，前端需回归：

| 动作 | 路径 |
| --- | --- |
| 读取租户 | `GET /platform/tenant` |
| 更新租户 | `PUT /platform/tenant` |
| 权限资源 | `GET /platform/permissions` |
| 角色授权 | `GET /platform/role-grants` |
| 权限适配器 | `GET /platform/permission-adapters` |
| 适配器同步 | `POST /platform/permission-adapters/{id}/sync` |
| 审计日志 | `GET /platform/audits` |
| 能力更新 | `PUT /platform/capabilities/{code}` |
| 安全参数更新 | `PUT /platform/parameters/security` |

账号状态和密码重置仍需统一：

| 前端当前 | 后端已有 |
| --- | --- |
| `/platform/accounts/{id}/status` | `/platform/employee-accounts/{id}/status` |
| `/platform/accounts/{id}/password-reset` | `/platform/employee-accounts/{id}/reset-password` |

处理方式需在联调前冻结：要么前端迁移到 Auth 域路径，要么后端提供正式兼容别名。

### 3.7 Workbench

前端已支持参数，后端已实现。联调重点：

1. `todoLimit`
2. `activityLimit`
3. `eventScope=KEY/ALL`
4. `cursor`
5. `date`
6. `schemaVersion=1.1`

验收：

1. 不同 limit 生效。
2. cursor 翻页不重复、不丢数据。
3. `KEY` 只返回关键事件。
4. `ALL` 返回授权范围内全部事件。
5. 业务日期使用租户时区。

## 4. 后端补充方案

### 4.1 已完成方案

1. 销售履约命令服务已实现。
2. RMA 状态机已实现。
3. 客户签收聚合已实现。
4. 销售完成校验已实现。
5. 库存默认仓库字段已实现。
6. Finance AR/AP、核销、冲销已实现。
7. Workbench schema 1.1 基础能力已实现。
8. Platform 兼容接口已补齐。

### 4.2 待补充或冻结

| 项 | 说明 |
| --- | --- |
| RMA 红字 AR 财务命令 | 当前由 RMA transition 内部创建财务 `Receivable`。PRD 还要求独立 `/finance/rma-credit-notes` 命令，需要后续统一 |
| 跨模块事务边界 | 履约、库存、财务不能简单放进一个隐式大事务，应使用同一 Correlation ID、Outbox/Inbox、幂等和补偿 |
| 仓库类型与产品/物料分类兼容矩阵 | 未冻结前不能完整实现分类校验 |
| Platform 账号路径 | 需要决定前端迁移到 Auth 域，还是后端保留 Platform 兼容别名 |
| 手工入库 | 前端仍为占位，需要后端正式入库命令或复用既有库存事实导入命令并补公开契约 |

## 5. 联调阶段计划

### Sprint 0：契约冻结与环境准备

预计：0.5 天

任务：

1. 冻结销售履约、库存、Finance、Platform、Workbench 接口字段。
2. 准备专用联调租户。
3. 准备老板、销售、仓管、财务、采购、人事账号。
4. 准备仓库、产品、物料、客户、供应商主数据。
5. 准备联调报告目录和结果模板。

交付：

1. 最终 OpenAPI 基线。
2. 联调账号清单。
3. 联调数据准备脚本或清单。
4. 测试账号权限矩阵。

### Sprint 1：销售履约前端接入

预计：2 天

任务：

1. 新增销售履约命令 API client。
2. RMA 页面接入创建和状态流转。
3. 客户签收页面接入登记。
4. 销售订单页面接入完成检查和完成关闭。
5. 展示 `creditNoteFinanceId`、`receiptStatus`、`transitionHistory`、`missingConditions`。
6. 屏蔽旧 RMA/签收写路径。
7. 增加前端单元测试和受控浏览器回归。

验收：

1. RMA 全生命周期可用。
2. 幂等重放不产生重复事实。
3. 数量守恒校验通过。
4. 版本冲突返回 409。
5. 页面不显示假成功。

### Sprint 2：客户签收与销售完成闭环

预计：1.5 天

任务：

1. 销售订单已发货后创建签收。
2. 部分签收、拒收、破损展示。
3. 拒收/破损创建 RMA、红字 AR 或折让。
4. 差额闭合后允许完成关闭。
5. 完成关闭后订单只读。
6. 校验 `closureFactId` 和完成事件。

验收场景：

| 场景 | 预期 |
| --- | --- |
| 10 件发货，签收 10 件 | `SIGNED`，可进入完成判断 |
| 10 件发货，8 正常 + 1 拒收 + 1 破损 | `DISPUTED`，不能完成 |
| 差额 RMA/红字闭合，AR 结算 | 可完成 |
| 缺少任一前置条件 | 返回 `missingConditions` |

### Sprint 3：库存默认仓库联调

预计：1 天

任务：

1. 产品新增、编辑、刷新、重新打开弹窗回归。
2. 物料新增、编辑、刷新、重新打开弹窗接入。
3. 校验历史未关联展示。
4. 校验停用仓库不可选。
5. 校验修改默认仓库不改变库存。
6. 校验销售产品选项根据默认仓库正确展示。

验收：

1. 页面、API、数据库三者 `defaultWarehouseId` 一致。
2. 未配置显示“未关联”。
3. 配置仓库后，仓库详情立即显示归属。
4. 原仓库存事实不变。

### Sprint 4：Finance 核销与冲销联调

预计：1.5 天

任务：

1. 新增 Finance closure API client。
2. 增加 AR/AP 聚合台账。
3. 增加核销表单和核销列表。
4. 增加冲销入口和冲销结果展示。
5. 校验币种、余额、幂等、权限和事件。

验收场景：

| 场景 | 预期 |
| --- | --- |
| AR 100 元，收款确认 100 元，核销 100 元 | AR `SETTLED` |
| 核销金额超过未收余额 | 422 |
| 币种不一致 | 422 |
| 冲销收款 100 元 | 生成反向收款，AR 余额恢复 |
| 重复冲销 | 409 |

### Sprint 5：Platform 与 Workbench 回归

预计：1 天

任务：

1. Platform tenant、permissions、role-grants、adapters、audits、capabilities、security parameters 回归。
2. 账号状态和密码重置路径归一。
3. Workbench `date/eventScope/todoLimit/activityLimit/cursor` 回归。
4. Workbench schema 1.1 字段展示。

验收：

1. 平台页面无 404/405。
2. 所有保存后重新读取一致。
3. Workbench 不同 limit 生效。
4. cursor 翻页不重复、不遗漏。
5. `eventScope=KEY` 只返回关键事件。

### Sprint 6：全链路真实数据回归

预计：1.5 天

按 PRD P0 全链路执行：

```text
销售订单
  → 库存校验/预留
    → 缺货生产需求
      → MRP/MPS
        → PR
          → PO
            → 采购收货
              → 生产领料/报工/检验
                → 完工入库
                  → 原任务重校验
                    → 销售发货
                      → 发货确权 AR
                        → 收款核销
                          → 客户签收
                            → 销售完成关闭
```

同时执行：

1. RMA 退货。
2. 合格品回入库。
3. 红字 AR。
4. 部分发货。
5. 部分签收。
6. 差额处理。
7. 并发提交。
8. 幂等重放。
9. 服务重启后事实保留。

## 6. 联调接口清单

### P0 必须联调

| 编号 | 方法 | 路径 | 前端页面 | 状态 |
| --- | --- | --- | --- | --- |
| I-01 | POST | `/api/v1/rmas` | 销售 RMA | 待前端 |
| I-02 | POST | `/api/v1/rmas/{id}/transition` | 销售 RMA | 待前端 |
| I-03 | GET | `/api/v1/fulfillment/rmas` | 销售 RMA | 已接通 |
| I-04 | POST | `/api/v1/sales-orders/{orderId}/receipts` | 客户签收 | 待前端 |
| I-05 | GET | `/api/v1/fulfillment/customer-receipts` | 客户签收 | 已接通 |
| I-06 | POST | `/api/v1/sales-orders/{orderId}/complete-check` | 销售订单 | 待前端 |
| I-07 | POST | `/api/v1/sales-orders/{orderId}/complete` | 销售订单 | 待前端 |
| I-08 | POST/PATCH | `/api/v1/inventory/materials` | 物料主数据 | 后端已实现，前端待接 |
| I-09 | PATCH | `/api/v1/inventory/materials/{id}` | 物料主数据 | 后端已实现，前端待接 |
| I-10 | GET | `/api/v1/finance/ar-aps` | 财务台账 | 后端已实现，前端待接 |
| I-11 | GET/POST | `/api/v1/finance/allocations` | 财务核销 | 后端已实现，前端待接 |
| I-12 | POST | `/api/v1/finance-documents/{id}/reverse` | 财务冲销 | 后端已实现，前端待接 |
| I-13 | GET | `/api/v1/workbench/dashboard` | 工作台 | 已实现，待 schema 回归 |

### P1 建议联调

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/PUT | `/platform/tenant` | 租户信息 |
| GET | `/platform/permissions` | 权限资源兼容视图 |
| GET | `/platform/role-grants` | 角色授权 |
| GET/POST | `/platform/permission-adapters` | 权限适配器 |
| POST | `/platform/permission-adapters/{id}/sync` | 适配器同步 |
| GET | `/platform/audits` | 审计日志 |
| PUT | `/platform/capabilities/{code}` | 能力更新 |
| PUT | `/platform/parameters/security` | 安全参数 |
| GET/POST/PATCH | `/sales/sla-rules` | SLA 规则 |
| GET | `/sales/sla-notifications` | SLA 通知 |

## 7. 测试数据要求

### 7.1 主数据

| 类型 | 数量 | 说明 |
| --- | ---: | --- |
| 租户 | 2 | 主租户 + 隔离测试租户 |
| 工厂/组织 | 2 | 至少一个授权工厂 |
| 仓库 | 3 | 成品仓、原材料仓、停用仓 |
| 产品 | 3 | 成品、半成品、未关联默认仓产品 |
| 物料 | 3 | 原材料、辅料、半成品 |
| 客户 | 2 | 正常客户 + 争议客户 |
| 供应商 | 2 | 正常供应商 + 退货供应商 |
| 员工 | 5 | 老板、销售、仓管、财务、生产 |

### 7.2 业务数据

| 数据 | 数量 | 用途 |
| --- | ---: | --- |
| 销售订单 | 5 | 正常、部分发货、全量发货、缺货、取消 |
| 发货任务 | 5 | 待出库、部分可发、已出库、缺货、补货中 |
| RMA | 3 | 待审批、检验完成、已关闭 |
| 客户签收 | 3 | 全签、部分签、争议 |
| AR | 3 | 未结算、部分结算、已结算 |
| AP | 2 | 未结算、已结算 |
| 收付款 | 4 | 入账、出账、待确认、已确认 |
| 核销 | 2 | 部分核销、全额核销 |
| 工单 | 3 | 执行中、完工、结案 |
| 采购订单 | 3 | 待收货、部分收货、已收货 |

## 8. 验收标准

### 8.1 功能验收

所有联调场景必须通过：

1. 正常成功。
2. 空态。
3. 无权限。
4. 未登录。
5. 跨租户拒绝。
6. 参数错误。
7. 业务状态冲突。
8. 版本冲突。
9. 幂等重放。
10. 服务重启后事实保留。

### 8.2 数据验收

1. 前端展示 ID、编号、状态、数量、金额与 API 一致。
2. API 响应与数据库事实一致。
3. 所有聚合拥有 `version`。
4. 所有来源关系可穿透。
5. 数量和金额守恒。
6. 状态机不能跳跃。
7. 删除和冲销不物理抹除审计事实。

### 8.3 非功能验收

1. 所有命令有审计。
2. 所有写接口有幂等键。
3. 所有聚合更新支持乐观锁。
4. 租户隔离不越权。
5. 页面不出现假成功。
6. 页面不使用本地业务数据补齐。
7. API 错误展示后端 `message` 和 `suggestion`。

## 9. 回归清单

| 顺序 | 回归项 | 对应模块 |
| ---: | --- | --- |
| 1 | 产品/物料默认仓库新增、编辑、回读 | 库存 |
| 2 | 销售订单创建、确认、发货申请 | 销售 |
| 3 | 库存预留、出库、部分发货 | 库存 |
| 4 | 全量发货、发货确权 AR | 销售/财务 |
| 5 | 收款确认、核销 | 财务 |
| 6 | 客户签收 | 销售 |
| 7 | RMA 创建、审批、检验、回入库、红字 AR、关闭 | 销售/库存/财务 |
| 8 | 销售完成关闭 | 销售 |
| 9 | 生产需求、MRP、工单、报工、完工、结案 | 生产 |
| 10 | 采购 PR、PO、收货、检验、退货、AP | 采购 |
| 11 | Workbench 搜索、分页、事件范围 | 工作台 |
| 12 | Platform 权限、账号、审计 | 平台 |

## 10. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 前端仍调用旧写路径 | 410 或 404 | 迁移到 PRD 契约，旧路径只保留明确 410 |
| RMA 红字 AR 跨模块失败 | 库存已回入库但财务未生成红字 | Outbox/补偿和状态核对，禁止静默关闭 |
| 签收聚合重复创建 | 数量重复累计 | 租户/订单唯一键 + 幂等键 |
| 仓库分类兼容矩阵未冻结 | 无法校验默认仓库合法性 | 先冻结矩阵，再放开保存 |
| 历史数据无默认仓库 | 销售开单产品可能被过滤 | 显示“未关联”，由管理员补录 |
| 币种混合 | 财务金额无法汇总 | 单币种核销；混合币种返回 UNAVAILABLE 或 422 |
| 旧文档路径冲突 | 开发误用路径 | 以 OpenAPI 为准，修订 PRD/技术设计 |

## 11. 完成标准

前后端联调完成必须同时满足：

1. 所有 P0 前端动作接入后端正式接口。
2. 所有旧写路径从前端移除或明确 deprecated。
3. OpenAPI、后端 Controller、前端 client 三方一致。
4. 自动化契约校验通过。
5. 后端全量测试通过。
6. 前端类型检查和单元测试通过。
7. 真实联调脚本通过。
8. 专用数据集上的销售、库存、生产、采购、财务、售后全链路回归通过。
9. 数据库事实、API 响应、页面展示三方一致。
10. 部署环境复测不再出现已关闭阻断项。

## 12. 当前结论

后端主体能力和 API 契约已经具备，前端当前主要停留在“读取已接通、写入未全面接入”的状态。

下一轮执行应优先完成：

1. 销售履约前端命令接入。
2. 客户签收和完成关闭接入。
3. 物料默认仓库前端接入。
4. Finance 核销与冲销前端接入。
5. Platform 残留路径归一。
6. Workbench 分页和事件范围回归。

以上完成后，再执行 PRD P0 全链路真实数据回归，并关闭历史测试报告中的阻断项。
