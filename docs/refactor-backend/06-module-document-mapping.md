# `module_document` 到物理表映射

本文映射当前代码和本地数据中的全部 `module_document(kind)`。映射原则：

1. 优先使用既有物理表。
2. 聚合有主表和子表时，必须拆到子表。
3. 只有确实没有既有表时才新增表。
4. JSONB 只允许作为历史快照或极少数外部负载，不允许继续作为业务事实表。

## 1. 总量

本地快照显示 `module_document` 有 8 个模块、60 个 `kind`：

| 模块 | kind 数 | 文档数 |
| --- | ---: | ---: |
| fulfillment | 24 | 183 |
| platform | 12 | 473 |
| production | 11 | 197 |
| ai | 3 | 9 |
| finance | 3 | 9 |
| personnel | 3 | 9 |
| supplychain | 3 | 9 |
| message | 1 | 5 |
| 合计 | 60 | 894 |

代码中还定义了暂无本地数据的 `kind`，例如 AI 模型配置、行动计划、消息模板、订阅和偏好；这些也纳入映射。

## 2. fulfillment / 销售、库存、采购

| `kind` | 业务聚合 | 目标既有表 | 表状态 |
| --- | --- | --- | --- |
| `order` | 销售订单 | `sales_order` + `sales_order_line` | 已有 |
| `shipmentRequest` | 发货申请 | `sales_shipment_request` + `sales_shipment_request_line` | 已有 |
| `shipmentTask` | 发货任务 | `inv_shipment_task` + `inv_shipment_task_line` | 已有 |
| `availability` | 库存可用量事实 | `inv_availability_projection` | 已有 |
| `reservation` | 库存预留 | `inv_reservation` + `inv_reservation_line` | 已有 |
| `outbound` | 销售出库 | `inv_sales_outbound` + `inv_sales_outbound_line` | 已有 |
| `transaction` | 库存事务 | `inv_transaction` | 已有 |
| `purchaseRequest` | 采购申请 | `proc_purchase_request` | 已有 |
| `purchaseOrder` | 采购订单 | `proc_purchase_order`；缺行表则补 `proc_purchase_order_line` | 既有主表 |
| `purchaseReceipt` | 采购收货 | `proc_purchase_receipt`；缺行表则补 `proc_purchase_receipt_line` | 既有主表 |
| `purchaseReturn` | 采购退货 | `proc_purchase_return` | 已有 |
| `supplier` | 采购供应商 | `proc_supplier` | 已有 |
| `warehouse` | 仓库 | `inv_warehouse` | 已有 |
| `product` | 产品 | `inv_product` | 已有 |
| `material` | 物料 | `inv_material` | 已有 |
| `transferOrder` | 调拨单 | `inv_transfer_order` + `inv_transfer_line` | 已有 |
| `stocktakeTask` | 盘点任务 | `inv_stocktake_task` + `inv_stocktake_line` | 已有 |
| `timeline` | 履约时间线 | `fulfill_status_history` | 已有 |
| `inbox` | 履约事件 Inbox | `fulfill_event_inbox` | 已有 |
| `outbox` | 履约事件 Outbox | `fulfill_event_outbox` | 已有 |
| `idempotency` | 履约幂等记录 | `fulfill_idempotency_record` | 已有 |
| `wmsResult` | WMS 回写结果 | 新增 `inv_wms_result` | 无既有表 |
| `rma` | 销售退货 | 新增 `sales_rma` + `sales_rma_line` | 无既有表 |
| `receipt` | 客户签收 | 新增 `sales_customer_receipt` + `sales_customer_receipt_line` | 无既有表 |
| `quote` | 报价单 | 新增 `sales_quote` + `sales_quote_line` | 无既有表 |
| `customer` | 销售域客户 | `sc_customer`（与产业链共用客户主数据） | 已有 |
| `slaRule` | SLA 规则 | 新增 `sales_sla_rule` | 无既有表 |
| `slaNotification` | SLA 通知 | 新增 `sales_sla_notification` | 无既有表 |
| `audit` | 履约审计 | `fulfill_audit_snapshot` | 已有 |

新增表说明：这些是补齐既有业务聚合的必要子表或独立聚合，不是替代已有物理模型的第二套模型。

## 3. production / 生产

| `kind` | 业务聚合 | 目标既有表 | 表状态 |
| --- | --- | --- | --- |
| `demand` | 生产需求 | `prod_demand` | 已有 |
| `demandSource` | 需求来源 | `prod_demand_source` | 已有 |
| `workOrder` | 工单 | `prod_work_order` | 已有 |
| `workOrderDemand` | 工单需求分配 | `prod_work_order_demand` | 已有 |
| `workReport` | 报工 | `prod_work_report` | 已有 |
| `reportCorrection` | 报工更正 | `prod_work_report_correction` | 已有 |
| `inspection` | FQC/检验 | `prod_inspection` | 已有 |
| `reworkOrder` | 返工单 | `prod_rework_order` | 已有 |
| `completion` | 完工 | `prod_completion` | 已有 |
| `completionAllocation` | 完工需求分配 | `prod_completion_allocation` | 已有 |
| `closeRequest` | 工单结案 | `prod_work_order_close` | 已有 |
| `operationTask` | 异步操作任务 | `prod_operation_task` | 已有 |
| `statusHistory` | 生产状态历史 | `prod_status_history` | 已有 |
| `outbox` | 生产 Outbox | `prod_event_outbox` | 已有 |
| `inbox` | 生产 Inbox | `prod_event_inbox` | 已有 |
| `idempotency` | 生产幂等记录 | `prod_idempotency_record` | 已有 |
| `audit` | 生产审计 | `prod_audit_snapshot` | 已有 |
| `inventoryAvailability` | 生产可用库存事实 | `prod_inventory_availability` | 已有 |
| `salesOrderIntake` | 销售缺货进入生产 | `prod_sales_order_intake` | 已有 |
| `materialTransactionBlocker` | 领料阻塞事实 | `prod_material_transaction`（使用 blocker 类型） | 已有 |
| `bomSnapshot` | BOM/工艺快照 | `prod_bom_snapshot`；配置主数据另用 `prod_bom`、`prod_bom_item`、`prod_routing`、`prod_routing_step` | 已有 |

## 4. finance / 财务

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `receivable` | 应收 | `fin_receivable` | 已有 |
| `payable` | 应付 | `fin_payable` | 已有 |
| `payment` | 收付款 | `fin_payment` | 已有 |
| `allocation` | 核销 | 新增 `fin_allocation` | 无既有表 |
| `invoice` | 发票 | `fin_invoice` | 已有 |
| `voucher` | 凭证 | `fin_voucher` | 已有 |
| `costAccounting` | 成本归集 | `fin_cost_accounting` | 已有 |

## 5. platform / 平台

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `tenant` | 租户 | `iam_tenant` | 已有 |
| `orgUnit` | 组织/部门 | `iam_org_unit` | 已有，037 已建立 source_id 映射 |
| `resource` | 企业资源 | `iam_enterprise_resource` | 已有 |
| `employee` | 平台员工 | `iam_employee` | 已有 |
| `account` | 平台账号 | `iam_account` | 已有 |
| `role` | 角色 | `iam_role` | 已有 |
| `permission` | 权限目录 | `iam_permission_resource` | 已有 |
| `roleGrant` | 角色授权 | `iam_role_grant` | 已有 |
| `approvalRule` | 审批规则 | `iam_approval_rule` | 已有 |
| `dictionary` | 字典 | `iam_dictionary` | 已有 |
| `parameter` | 参数 | `iam_parameter` | 已有 |
| `auditLog` | 审计 | `iam_audit_log` | 已有 |

| `position` | 当前实现中的岗位 | `iam_position` | 已有；ISSUE-035 目标态为删除该表和授权链路 |

## 6. message / 消息

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `record` | 消息记录 | `msg_record` | 已有 |
| `template` | 消息模板 | `msg_template` | 已有 |
| `preference` | 用户偏好 | `msg_user_preference` | 已有 |
| `subscription` | 事件订阅 | `msg_subscription` | 已有 |

## 7. personnel / 人员

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `employee` | 员工档案 | `hr_employee` | 已有 |
| `attendance` | 考勤 | `hr_attendance` | 已有 |
| `skill` | 技能资料 | `hr_skill` | 已有 |

## 8. supplychain / 产业链

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `supplier` | 产业链供应商 | `sc_supplier` | 已有 |
| `customer` | 产业链客户 | `sc_customer` | 已有 |
| `riskEvent` | 风险事件 | `sc_risk_event` | 已有 |

## 9. ai / AI

| `kind` | 业务聚合 | 目标表 | 表状态 |
| --- | --- | --- | --- |
| `modelConfig` | 模型配置 | `ai_model_config` | 已有 |
| `conversation` | 会话 | `ai_conversation` | 已有 |
| `message` | AI 消息 | `ai_message` | 已有 |
| `insight` | 洞察 | `ai_insight` | 已有 |
| `actionPlan` | 行动计划 | `ai_action_plan` | 已有 |

## 10. 通用基础设施

| 当前能力 | 目标表 | 说明 |
| --- | --- | --- |
| `module_outbox_event` | 各模块既有 outbox 表 | 最终删除通用表写入 |
| `module_audit_log` | 各模块审计表 | 或保留统一审计表但必须使用具名 Entity |
| `module_idempotency_record` | 各模块幂等表 | 最终按模块隔离 |

## 11. 新增表汇总

以下表没有既有结构，必须新增：

1. `sales_rma`
2. `sales_rma_line`
3. `sales_customer_receipt`
4. `sales_customer_receipt_line`
5. `sales_quote`
6. `sales_quote_line`
7. `sales_sla_rule`
8. `sales_sla_notification`
9. `fin_allocation`
10. `inv_wms_result`

以下行表是既有主表缺失的子表，需要补齐：

1. `proc_purchase_order_line`
2. `proc_purchase_receipt_line`

除上述表外，不新增第二套业务事实表。
