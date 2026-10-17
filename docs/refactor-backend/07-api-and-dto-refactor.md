# API 入参、出参与 DTO 重构

## 1. 目标

1. 所有 Controller 入参使用具名 Request record。
2. 所有 Controller 出参使用具名 Response record。
3. 禁止 `JsonNode`、`ObjectNode`、`ArrayNode`、`Map<String, Object>` 出现在 Controller 和 Application Service 签名中。
4. 禁止把 JPA Entity 直接返回给前端。
5. API 契约中的每个字段都能对应到具名 Java 字段。

## 2. Controller 模板

```java
@RestController
@RequestMapping("/api/v1/sales/orders")
public class SalesOrderController {

    private final SalesOrderApplicationService salesOrderApplicationService;

    public SalesOrderController(SalesOrderApplicationService salesOrderApplicationService) {
        this.salesOrderApplicationService = salesOrderApplicationService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SalesOrderResponse createOrder(
            @Valid @RequestBody CreateSalesOrderRequest request,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            Authentication authentication
    ) {
        return salesOrderApplicationService.create(
                request.toCommand(TenantContext.current(), idempotencyKey, authentication.getName())
        );
    }
}
```

## 3. Request 设计

每个写操作定义独立 Request，不复用聚合 Entity。

| 模块 | Request 示例 |
| --- | --- |
| 销售 | `CreateSalesOrderRequest`、`ConfirmSalesOrderRequest`、`CreateShipmentRequest` |
| 库存 | `ReserveInventoryRequest`、`PostOutboundRequest`、`CreateManualInboundRequest` |
| 采购 | `CreatePurchaseRequestRequest`、`CreatePurchaseOrderRequest`、`ReceivePurchaseOrderRequest` |
| 生产 | `CreateProductionDemandRequest`、`CreateWorkOrderRequest`、`SubmitWorkReportRequest` |
| 财务 | `RegisterPaymentRequest`、`ConfirmPaymentRequest`、`CreateAllocationRequest` |
| 平台 | `CreateOrgUnitRequest`、`CreateAccountRequest`、`UpdateRoleGrantRequest` |
| 消息 | `CreateMessageTemplateRequest`、`MarkMessagesReadRequest` |
| 人员 | `CreatePersonnelEmployeeRequest`、`UpdateAttendanceRequest` |
| 产业链 | `CreateChainSupplierRequest`、`CreateChainCustomerRequest` |
| AI | `CreateAiConversationRequest`、`SubmitAiFeedbackRequest` |

Request 示例：

```java
public record ConfirmSalesOrderRequest(
        @NotNull
        @Positive
        Long version
) {}
```

```java
public record CreateManualInboundRequest(
        @NotBlank String warehouseId,
        @NotBlank String productId,
        @NotNull @Positive BigDecimal quantity,
        @NotBlank String unit,
        @Size(max = 500) String remark
) {}
```

## 4. Response 设计

1. 列表返回 `PageResponse<T>`。
2. 单据返回专属 `XxxResponse`。
3. 状态使用枚举响应对象或字符串枚举，不返回自由文本 Map。
4. 金额、数量、版本使用原始类型或 `BigDecimal`，不使用 JSON 字符串。
5. 缺失事实返回 `null` 并配合 `availability` 字段，不允许构造 0。

通用分页：

```java
public record PageResponse<T>(
        List<T> items,
        long total,
        int page,
        int pageSize,
        boolean hasMore
) {
    public static <T> PageResponse<T> of(PageResult<T> result) { ... }
}
```

## 5. Command / Query 设计

Application Service 只接收 Command 或 Query。

```java
public record ConfirmSalesOrderCommand(
        TenantId tenantId,
        OrderId orderId,
        long expectedVersion,
        OperatorId operatorId,
        String idempotencyKey
) {}
```

```java
public record ProductionCompletionCommand(
        TenantId tenantId,
        WorkOrderId workOrderId,
        InspectionId inspectionId,
        Quantity quantity,
        String unit,
        WarehouseId inventoryWarehouseId,
        TraceMode traceMode,
        int allocationRevision,
        LocalDate businessDate,
        OperatorId operatorId
) {}
```

## 6. Entity 与 Response 转换

每个模块建立 Mapper：

```text
sales.interfaces.mapper.SalesOrderResponseMapper
finance.interfaces.mapper.PaymentResponseMapper
production.interfaces.mapper.WorkOrderResponseMapper
platform.interfaces.mapper.AccountResponseMapper
```

规则：

1. Mapper 只做字段映射，不做业务判断。
2. 不使用 Spring 的 `BeanUtils.copyProperties` 盲拷贝。
3. 集合字段返回不可变 List。
4. 状态由 Domain 枚举映射为 Response 枚举。
5. 缺失来源事实返回 null 或 `Availability.UNAVAILABLE`，不允许补 0。

## 7. 当前主要改造点

| 当前类 | 当前问题 | 重构动作 |
| --- | --- | --- |
| `FulfillmentController` | 入参 `JsonNode`、出参 `JsonNode/Map` | 按销售订单、库存、采购、主数据拆分 Controller 和 DTO |
| `SalesFulfillmentController` | RMA、签收、完成关闭使用 Map | 定义 RMA Transition Request、Receipt Supplement Request、Completion Check Response |
| `ProductionController` | 工单和完工入参 `ObjectNode` | 定义 WorkOrder Create/Report/Completion Request |
| `FinanceController` | 核销和冲销入参 `JsonNode` | 定义 Allocation Request、Reversal Request、Confirm Payment Request |
| `PlatformController` | 通用 CRUD 使用 `Map<String, Object>` | 按租户、组织、员工、账号、角色、字典定义 Request/Response |
| `AiBusinessQueryService` | 直接读取 `JsonNode` 聚合 | 注入具名 Query Repository 或 Query Service |
| `WorkbenchController` | 手工构造指标 Map | 定义 Workbench Section Response |

## 8. 错误响应

保持统一结构：

```json
{
  "data": null,
  "error": {
    "code": "SALES_ORDER_VERSION_CONFLICT",
    "message": "订单已被其他人修改",
    "suggestion": "刷新后重试",
    "retryable": false,
    "traceId": "trace-001",
    "fieldErrors": []
  }
}
```

Java 结构：

```java
public record ErrorResponse(
        String code,
        String message,
        String suggestion,
        boolean retryable,
        String traceId,
        List<FieldErrorResponse> fieldErrors
) {}
```

## 9. 兼容策略

1. 对外字段名保持不变，仅替换 Java 内部实现。
2. 历史 `directRoleIds` 可在 API 兼容期继续返回，但写接口只接受 `roleId`。
3. 旧 `status` 别名如确有必要，由 Mapper 生成只读字段，不再写入新模型。
4. 契约变更通过 OpenAPI diff 记录，不允许 Controller 和文档分别漂移。
