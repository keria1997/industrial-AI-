# 分模块重构计划

## 1. 任务分类

每个模块完成以下五类工作：

| 类别 | 内容 |
| --- | --- |
| Domain | 聚合、实体、值对象、状态机 |
| Application | Command/Query、Service、事务边界 |
| Interface | Controller、Request/Response、Mapper |
| Infrastructure | JPA Entity、Repository、既有表映射 |
| Migration | `module_document` 数据回填和校验 |

## 2. 消息模块

### 当前实现

`MessageController` -> `AbstractMessageStore` -> `JdbcMessageStore` -> `module_document(kind=message/template/preference/subscription)`。

### 目标类

```text
com.wanshen.platform.message.api.MessageController
com.wanshen.platform.message.api.dto.MessageTemplateRequest
com.wanshen.platform.message.application.MessageApplicationService
com.wanshen.platform.message.domain.MessageRecord
com.wanshen.platform.message.domain.repository.MessageRecordRepository
com.wanshen.platform.message.infrastructure.persistence.MessageRecordEntity
com.wanshen.platform.message.infrastructure.persistence.MessageRecordJpaRepository
```

### 物理表

| kind | 表 |
| --- | --- |
| `record` | `msg_record` |
| `template` | `msg_template` |
| `preference` | `msg_user_preference` |
| `subscription` | `msg_subscription` |

### 验收

1. 列表、详情、已读、归档、模板 CRUD 使用 JPA。
2. 已读不改变业务事实。
3. Outbox Worker 使用 JPA Outbox。

## 3. AI 模块

### 当前实现

`AiController` 使用 `JsonNode`；`AiBusinessQueryService` 跨模块读取 `module_document`。

### 目标类

```text
com.wanshen.platform.ai.api.AiController
com.wanshen.platform.ai.application.AiConversationService
com.wanshen.platform.ai.application.AiInsightQueryService
com.wanshen.platform.ai.domain.AiConversation
com.wanshen.platform.ai.domain.repository.AiConversationRepository
com.wanshen.platform.ai.infrastructure.persistence.AiConversationEntity
```

### 物理表

| kind | 表 |
| --- | --- |
| `modelConfig` | `ai_model_config` |
| `conversation` | `ai_conversation` |
| `message` | `ai_message` |
| `insight` | `ai_insight` |
| `actionPlan` | `ai_action_plan` |

### 影响分析

AI 跨模块查询应改为调用业务模块 Query Service，禁止继续直查其他模块 `module_document`。

## 4. 人员模块

### 当前实现

员工、考勤、技能写入 `module_document`。

### 目标类

```text
com.wanshen.platform.personnel.api.PersonnelEmployeeController
com.wanshen.platform.personnel.application.PersonnelEmployeeService
com.wanshen.platform.personnel.domain.PersonnelEmployee
com.wanshen.platform.personnel.infrastructure.persistence.PersonnelEmployeeEntity
```

### 物理表

| kind | 表 |
| --- | --- |
| `employee` | `hr_employee` |
| `attendance` | `hr_attendance` |
| `skill` | `hr_skill` |

## 5. 产业链模块

### 当前实现

供应商、客户、风险事件写入 `module_document`。

### 目标类

```text
com.wanshen.platform.supplychain.api.SupplierController
com.wanshen.platform.supplychain.api.ChainCustomerController
com.wanshen.platform.supplychain.api.RiskEventController
com.wanshen.platform.supplychain.application.SupplierApplicationService
com.wanshen.platform.supplychain.domain.Supplier
com.wanshen.platform.supplychain.infrastructure.persistence.SupplierEntity
```

### 物理表

| kind | 表 |
| --- | --- |
| `supplier` | `sc_supplier` |
| `customer` | `sc_customer` |
| `riskEvent` | `sc_risk_event` |

## 6. 平台模块

### 当前实现

`PlatformController` 使用通用 `Map<String, Object>` CRUD；`PlatformService` 解析账号、组织、岗位、角色授权。

### 目标类

```text
com.wanshen.platform.platform.api.TenantController
com.wanshen.platform.platform.api.OrgUnitController
com.wanshen.platform.platform.api.AccountController
com.wanshen.platform.platform.api.RoleController
com.wanshen.platform.platform.application.AccountApplicationService
com.wanshen.platform.platform.application.RoleAuthorizationService
com.wanshen.platform.platform.domain.Account
com.wanshen.platform.platform.domain.Role
com.wanshen.platform.platform.infrastructure.persistence.AccountEntity
```

### 物理表

| kind | 表 |
| --- | --- |
| `tenant` | `iam_tenant` |
| `orgUnit` | `iam_org_unit` |
| `resource` | `iam_enterprise_resource` |
| `employee` | `iam_employee` |
| `account` | `iam_account` |
| `role` | `iam_role` |
| `permission` | `iam_permission_resource` |
| `roleGrant` | `iam_role_grant` |
| `adapter` | `iam_permission_adapter` |
| `approvalRule` | `iam_approval_rule` |
| `dictionary` | `iam_dictionary` |
| `parameter` | `iam_parameter` |
| `auditLog` | `iam_audit_log` |

### 目标态调整

结合 ISSUE-035：

1. 移除 Position 实体和 API。
2. 员工只保留组织归属。
3. 账号使用 `roleId` 单角色。
4. 授权解析不再合并 Position 默认角色。

## 7. 财务模块

### 当前实现

`FinanceController` 承担大量入参校验和业务流程；Store 使用 `module_document`。

### 目标类

```text
com.wanshen.platform.finance.api.ReceivableController
com.wanshen.platform.finance.api.PaymentController
com.wanshen.platform.finance.api.AllocationController
com.wanshen.platform.finance.application.PaymentApplicationService
com.wanshen.platform.finance.application.AllocationApplicationService
com.wanshen.platform.finance.domain.Receivable
com.wanshen.platform.finance.domain.Payment
com.wanshen.platform.finance.domain.Allocation
com.wanshen.platform.finance.infrastructure.persistence.ReceivableEntity
```

### 物理表

| kind | 表 |
| --- | --- |
| `receivable` | `fin_receivable` |
| `payable` | `fin_payable` |
| `payment` | `fin_payment` |
| `allocation` | `fin_allocation`（新增） |
| `invoice` | `fin_invoice` |
| `voucher` | `fin_voucher` |
| `costAccounting` | `fin_cost_accounting` |

### 重点

1. 确认、核销、冲销必须由领域方法控制。
2. 金额和余额使用 BigDecimal。
3. 禁止 Controller 直接改余额。

## 8. 销售、库存、采购模块

### 当前实现

统一放在 `fulfillment` 包，`FulfillmentService` 和 `FulfillmentStore` 承担过多职责。

### 目标拆分

```text
com.wanshen.platform.sales
com.wanshen.platform.inventory
com.wanshen.platform.procurement
```

### 销售目标类

```text
sales.api.SalesOrderController
sales.api.CustomerReceiptController
sales.api.RmaController
sales.application.SalesOrderApplicationService
sales.application.RmaApplicationService
sales.domain.SalesOrder
sales.domain.Rma
```

### 库存目标类

```text
inventory.api.AvailabilityController
inventory.api.ShipmentTaskController
inventory.api.OutboundController
inventory.application.InventoryReservationService
inventory.domain.InventoryAvailability
```

### 采购目标类

```text
procurement.api.PurchaseRequestController
procurement.api.PurchaseOrderController
procurement.api.PurchaseReceiptController
procurement.application.PurchaseReceiptApplicationService
procurement.domain.PurchaseOrder
```

## 9. 生产模块

### 当前实现

`ProductionService` 使用 `JsonNode` 管理需求、工单、报工、质检、完工、结案。

### 目标类

```text
production.api.ProductionDemandController
production.api.WorkOrderController
production.api.ProductionReportController
production.api.ProductionInspectionController
production.api.ProductionCompletionController
production.application.ProductionDemandApplicationService
production.application.WorkOrderApplicationService
production.domain.WorkOrder
production.domain.WorkReport
production.domain.ProductionInspection
```

## 10. 工作台模块

### 当前实现

`WorkbenchController` 直接聚合多个 Store。

### 目标类

```text
workbench.api.WorkbenchController
workbench.application.WorkbenchQueryService
workbench.application.WorkbenchMetricService
workbench.application.WorkbenchActivityService
```

工作台只调用各模块 Query Service，不直接访问 JPA Entity。
