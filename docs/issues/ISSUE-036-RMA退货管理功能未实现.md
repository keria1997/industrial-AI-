# ISSUE-036：RMA 退货管理功能未实现

- 级别：P1
- 模块：销售管理
- 层级：L1 业务域层
- 影响范围：前端
- 状态：🔴 待修复（后端已就绪，前端写操作未对接）

## 问题

销售管理 → 退货管理页签显示黄色警告横幅：

> 可查询退货记录。退货办理暂不可用，原出库行、检验、回入库和红字 AR 的业务校验待完善。金额缺少币种时显示"-"。

"创建 RMA"按钮可见但处于禁用状态。用户无法创建、审批、检验或关闭 RMA。

## 三维度综合分析

### 1. 后端（✅ 已就绪）

后端 RMA 功能**已完整实现**，包括业务逻辑和 REST API：

| 层 | 文件 | 状态 | 说明 |
|---|---|---|---|
| Service | `SalesAftercareService.java` | ✅ 完整 | `createRma()` 含幂等、原出库行校验、数量守恒；`transitionRma()` 支持 8 种状态迁移 |
| Controller | `SalesFulfillmentController.java` | ✅ 完整 | 6 个 REST 端点（列表 + 创建 + 审批 + 检验 + 关闭 + 状态迁移） |
| 存储 | `JdbcFulfillmentStore.java` | ✅ 完整 | `rmas = collections.jsonMap("rma")` 存储于 `module_document` |
| 事件 | 同 Service | ✅ 完整 | 发布 `sales.rma.created.v1` 和 `sales.rma.transitioned.v1` |

**后端 REST 端点：**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/fulfillment/rmas` | RMA 列表 |
| POST | `/api/v1/fulfillment/rmas` | 创建 RMA |
| PATCH | `/api/v1/fulfillment/rmas/{id}/approve` | 审批 |
| PATCH | `/api/v1/fulfillment/rmas/{id}/inspect` | 检验 |
| PATCH | `/api/v1/fulfillment/rmas/{id}/close` | 关闭 |
| POST | `/api/v1/rmas/{id}/transition` | 通用状态迁移 |

### 2. 前端（❌ 写操作未对接）

| 层 | 文件 | 状态 | 说明 |
|---|---|---|---|
| 读 API | `sales-aftercare.ts` | ✅ 已对接 | `listSalesRmas()` 调用 `GET /api/v1/fulfillment/rmas` |
| 列表组件 | `RmaManagementPanel.tsx` | ✅ 已对接 | 使用 `useApiResource` + `listSalesRmas` 渲染列表 |
| 状态映射 | 同上 | ✅ 完整 | 8 种状态均有 Badge 颜色映射 |
| **写 API** | `sales-aftercare.ts` | ❌ **故意省略** | 注释明确写"unsafe lifecycle commands are intentionally not exposed" |
| **创建表单** | 不存在 | ❌ 缺失 | 无创建 RMA 的表单组件 |
| **操作按钮** | 不存在 | ❌ 缺失 | 无审批/检验/关闭的操作按钮 |

**根因**：`sales-aftercare.ts` 第 63 行注释明确说明：

> Read RMA facts only; unsafe lifecycle commands are intentionally not exposed.

这是开发阶段的有意设计——先暴露只读查询，确认列表正常后再开启写操作。写操作 API 函数从未被添加到前端。

### 3. PRD 需求（✅ 已定义完整规则）

**PRD 7.3.9.2.6** 定义了完整的 RMA 业务规则：

| 规则项 | PRD 要求 |
|---|---|
| 状态机 | REQUESTED → APPROVED → IN_TRANSIT → RECEIVED → INSPECTING → INSPECTION_COMPLETED → RESTOCKED → CLOSED |
| 前置条件 | 必须关联原订单、原出库单、原出库行和原发货确权事实 |
| 数量守恒 | `requestedQty ≤ 原出库行已发数量 - 已RMA数量`；`receivedQty ≤ approvedQty`；`qualifiedQty + scrapQty + reworkQty = receivedQty` |
| 红字 AR | 按原发货确权行金额和批准退货数量计算，不直接修改原 AR |
| 权限 | 创建(sales.rma.create) / 审批(sales.rma.approve) / 关闭(sales.rma.close) 等 |
| 安全 | 所有写接口必须携带租户、Bearer Token、幂等键和 If-Match |
| 依赖 | 依赖签收 SIGNED + AR SETTLED + 无未关闭 RMA → 销售完成关闭 |

**PRD 结论**：后端实现与 PRD 规则一致（状态机、数量守恒、事件发布均已覆盖）。瓶颈仅在前端写操作未对接。

## 差距分析

| 层 | 已有 | 缺失 | 工作量 |
|---|---|---|---|
| 后端 | 全部 API + 业务逻辑 + 事件 | 无 | **0（无需修改）** |
| 前端 API | `listSalesRmas` 读函数 | `createRma` `approveRma` `inspectRma` `closeRma` 写函数 | 新增 4 个函数 |
| 前端 UI | 列表组件 `RmaManagementPanel` | 创建 RMA 表单弹窗 + 行内操作按钮（审批/检验/关闭） | 新增 1 个弹窗组件 + 修改列表操作列 |
| 数据库 | `module_document`（kind=rma） | 无需新表 | 0 |

## 方案

### 前端修改（仅前端）

| 文件 | 具体改动 |
|---|---|
| `frontend/src/api/sales-aftercare.ts` | 新增 `createRma(context, body)`、`transitionRma(context, id, action, body)` 函数 |
| `frontend/src/features/sales/components/RmaManagementPanel.tsx` | 添加"创建 RMA"表单弹窗 + 列表行内操作按钮（审批/检验/关闭） |

### 后端修改

**无需修改。** 后端 6 个 REST 端点和完整业务逻辑已就绪。

## 验收标准

1. 产品报价页签不再显示"尚未接入"警告（关联 ISSUE-032）
2. 出库管理发货成功后（需库存有数据），退货管理页"创建 RMA"按钮启用
3. 创建 RMA 后数据持久化到数据库（刷新不丢失）
4. RMA 审批 → 检验 → 回入库 → 红字 AR → 关闭全流程可操作
5. 合格品回入库后库存可用量增加

## 进展

🔴 待修复（后端已就绪，前端写操作待对接）

## 前置依赖

本 Issue 的完整验证依赖以下前置条件：

| 前置 | 关联 Issue | 说明 |
|---|---|---|
| 产品已创建且配置仓库 | DE-03 | 无产品则无法创建销售订单 |
| 仓库有库存 | DE-04 / ISSUE-037 | 无库存则无法发货，无出库行则无法创建 RMA |
| 销售订单已发货 | TC-FLOW-001 | RMA 关联已发货的出库行 |

