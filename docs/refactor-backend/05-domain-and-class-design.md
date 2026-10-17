# 领域模型与类设计

## 1. 通用设计

### 1.1 租户实体基类

```java
@MappedSuperclass
public abstract class TenantAuditableEntity {

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;
}
```

具体表如果已有 `uuid` 主键和 `source_id`，Entity 同时映射：

```java
@Id
@Column(name = "id")
private UUID internalId;

@Column(name = "source_id", unique = true)
private String sourceId;
```

领域层优先使用稳定业务 ID；内部 UUID 仅用于数据库关系。

### 1.2 通用值对象

```java
public record TenantId(String value) {}

public record Money(BigDecimal amount, Currency currency, TaxBasis taxBasis) {}

public record Quantity(BigDecimal value, String unit) {}

public record DocumentNo(String value) {}

public record PageRequest(int page, int pageSize) {}

public record PageResult<T>(List<T> items, long total, int page, int pageSize) {}
```

### 1.3 通用枚举

| 枚举 | 值来源 |
| --- | --- |
| `SalesOrderStatus` | 现有销售订单状态 |
| `ShipmentTaskStatus` | 现有发货任务状态 |
| `OutboundStatus` | 现有出库状态 |
| `ProductionDemandStatus` | 生产需求状态 |
| `WorkOrderStatus` | 工单状态 |
| `PaymentStatus` | 收付款状态 |
| `AllocationStatus` | 核销状态 |
| `IamAccountStatus` | 账号状态 |

## 2. 销售订单

### 2.1 实体

```java
@Entity
@Table(name = "sales_order")
public class SalesOrderEntity extends TenantAuditableEntity {
    @Id
    private UUID id;

    @Column(name = "order_no", unique = true)
    private String orderNo;

    @Column(name = "customer_id")
    private String customerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "overall_status")
    private SalesOrderStatus overallStatus;

    @Column(name = "total_amount", precision = 20, scale = 6)
    private BigDecimal totalAmount;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesOrderLineEntity> lines = new ArrayList<>();
}
```

```java
@Entity
@Table(name = "sales_order_line")
public class SalesOrderLineEntity extends TenantAuditableEntity {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_order_id", nullable = false)
    private SalesOrderEntity order;
}
```

### 2.2 Repository

```java
public interface SalesOrderRepository {
    Optional<SalesOrder> findById(TenantId tenantId, OrderId orderId);
    PageResult<SalesOrder> search(SalesOrderSearchCriteria criteria);
    SalesOrder save(SalesOrder order);
}
```

```java
interface SalesOrderJpaRepository extends JpaRepository<SalesOrderEntity, UUID> {
    Optional<SalesOrderEntity> findByTenantIdAndId(String tenantId, UUID id);
}
```

### 2.3 Application Service

```java
@Service
public class SalesOrderApplicationService {
    public SalesOrderResponse createOrder(CreateSalesOrderRequest request) { ... }
    public SalesOrderResponse confirmOrder(ConfirmSalesOrderCommand command) { ... }
    public SalesOrderResponse cancelOrder(CancelSalesOrderCommand command) { ... }
}
```

## 3. 客户签收

| 类 | 表 | 说明 |
| --- | --- | --- |
| `CustomerReceiptEntity` | `sales_customer_receipt` | 新表，聚合根 |
| `CustomerReceiptLineEntity` | `sales_customer_receipt_line` | 新表，行级签收 |
| `CreateCustomerReceiptCommand` | 无表 | 创建命令 |
| `SupplementCustomerReceiptCommand` | 无表 | 补签命令 |

不变量：

1. 同一租户内一个订单只有一个签收聚合。
2. 每行 `signedQty + rejectedQty + damagedQty = shippedQty`。
3. `receiptStatus` 由行级数量推导。

## 4. RMA

| 类 | 表 |
| --- | --- |
| `RmaEntity` | `sales_rma` |
| `RmaLineEntity` | `sales_rma_line` |
| `RmaStatusHistoryEntity` | `sales_rma_status_history` |

聚合根维护 `REQUESTED -> APPROVED/REJECTED -> ... -> CLOSED`。

## 5. 库存

| 领域对象 | 既有表 |
| --- | --- |
| `WarehouseEntity` | `inv_warehouse` |
| `ProductEntity` | `inv_product` |
| `MaterialEntity` | `inv_material` |
| `InventoryAvailabilityEntity` | `inv_availability_projection` |
| `ShipmentTaskEntity` | `inv_shipment_task` |
| `ShipmentTaskLineEntity` | `inv_shipment_task_line` |
| `SalesOutboundEntity` | `inv_sales_outbound` |
| `SalesOutboundLineEntity` | `inv_sales_outbound_line` |
| `InventoryTransactionEntity` | `inv_transaction` |
| `ReservationEntity` | `inv_reservation` |

库存核心不变量：

```text
fulfillableQty >= 0
reservedQty <= qualifiedOnHandQty
postedQty <= reservedQty
```

## 6. 采购

| 领域对象 | 既有表 |
| --- | --- |
| `PurchaseRequestEntity` | `proc_purchase_request` |
| `PurchaseOrderEntity` | `proc_purchase_order` |
| `PurchaseReceiptEntity` | `proc_purchase_receipt` |
| `PurchaseReturnEntity` | `proc_purchase_return` |
| `SupplierEntity` | `proc_supplier` |

如果既有表没有行表，新增行表并标记为“补齐既有聚合的子表”，不属于另起模型。

## 7. 生产

| 领域对象 | 既有表 |
| --- | --- |
| `ProductionDemandEntity` | `prod_demand` |
| `ProductionDemandSourceEntity` | `prod_demand_source` |
| `BomEntity` | `prod_bom` |
| `BomItemEntity` | `prod_bom_item` |
| `RoutingEntity` | `prod_routing` |
| `RoutingStepEntity` | `prod_routing_step` |
| `WorkOrderEntity` | `prod_work_order` |
| `WorkOrderOperationEntity` | `prod_work_order_operation` |
| `WorkReportEntity` | `prod_work_report` |
| `InspectionEntity` | `prod_inspection` |
| `CompletionEntity` | `prod_completion` |
| `CompletionAllocationEntity` | `prod_completion_allocation` |
| `WorkOrderCloseEntity` | `prod_work_order_close` |
| `ProductionStatusHistoryEntity` | `prod_status_history` |

聚合建议：

1. `ProductionDemandAggregate`：需求、来源、状态。
2. `WorkOrderAggregate`：工单、工序、需求分配、报工、完工。
3. `QualityInspectionAggregate`：检验、处置、返工。

## 8. 财务

| 领域对象 | 既有表 |
| --- | --- |
| `ReceivableEntity` | `fin_receivable` |
| `PayableEntity` | `fin_payable` |
| `PaymentEntity` | `fin_payment` |
| `AllocationEntity` | `fin_allocation`（需新增） |
| `InvoiceEntity` | `fin_invoice` |
| `VoucherEntity` | `fin_voucher` |
| `CostAccountingEntity` | `fin_cost_accounting` |

财务行为必须通过领域方法：

```java
public Allocation confirm(Payment payment, AccountId confirmerId) { ... }

public void reverse(ReversalReason reason, Approver approver) { ... }
```

## 9. 平台 IAM

当前状态：

1. `TenantCatalog` 和 `TenantProvisioningService` 会创建管理员岗位。
2. 员工快照使用 `primaryPositionId`。
3. 账号快照使用 `directRoleIds` 数组。
4. 授权解析会合并账号直挂角色与岗位默认角色。

目标状态：

1. 删除 Position 概念和 `iam_position`。
2. 员工只保留组织归属。
3. 账号使用单个 `roleId`。
4. 授权只读取账号直挂角色。

| 领域对象 | 既有表 |
| --- | --- |
| `TenantEntity` | `iam_tenant` |
| `OrgUnitEntity` | `iam_org_unit` |
| `IamEmployeeEntity` | `iam_employee` |
| `AccountEntity` | `iam_account` |
| `RoleEntity` | `iam_role` |
| `PermissionResourceEntity` | `iam_permission_resource` |
| `RoleGrantEntity` | `iam_role_grant` |
| `DictionaryItemEntity` | `iam_dictionary` |
| `ParameterEntity` | `iam_parameter` |
| `AuditLogEntity` | `iam_audit_log` |

目标规则：

1. 一个员工最多一个账号。
2. 一个账号只有一个 `role_id`。
3. 不存在 Position 实体。
4. 角色授权只来自账号直挂角色。

## 10. 消息、人员、产业链、AI

| 模块 | 实体 | 既有表 |
| --- | --- | --- |
| 消息 | `MessageRecordEntity` | `msg_record` |
| 消息 | `MessageTemplateEntity` | `msg_template` |
| 消息 | `UserPreferenceEntity` | `msg_user_preference` |
| 消息 | `SubscriptionEntity` | `msg_subscription` |
| 人员 | `PersonnelEmployeeEntity` | `hr_employee` |
| 人员 | `AttendanceEntity` | `hr_attendance` |
| 人员 | `SkillEntity` | `hr_skill` |
| 产业链 | `SupplierEntity` | `sc_supplier` |
| 产业链 | `ChainCustomerEntity` | `sc_customer` |
| 产业链 | `RiskEventEntity` | `sc_risk_event` |
| AI | `AiModelConfigEntity` | `ai_model_config` |
| AI | `AiConversationEntity` | `ai_conversation` |
| AI | `AiMessageEntity` | `ai_message` |
| AI | `AiInsightEntity` | `ai_insight` |
| AI | `AiActionPlanEntity` | `ai_action_plan` |

## 11. 通用基础设施

| 类 | 职责 |
| --- | --- |
| `PageResult<T>` | 统一分页响应 |
| `BusinessException` | 业务异常 |
| `ErrorCode` | 稳定错误码枚举 |
| `AuditEntryFactory` | 构造审计记录 |
| `OutboxEntryFactory` | 构造 Outbox 事件 |
| `IdempotencyRecordFactory` | 构造幂等记录 |
