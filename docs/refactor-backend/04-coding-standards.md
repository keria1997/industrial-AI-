# Java 规范、阿里巴巴规范与 Clean Code 规则

## 1. 命名

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| 类 | UpperCamelCase，名词 | `SalesOrderEntity` |
| 方法 | lowerCamelCase，动词或动宾 | `confirmPayment` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RESERVATION_LINES` |
| 包 | 全小写单词 | `com.wanshen.platform.sales.application` |
| DTO | 语义 + 类型 | `CreateSalesOrderRequest`、`SalesOrderResponse` |
| Command | 动词 + 聚合 + Command | `ConfirmSalesOrderCommand` |
| Query | 语义 + Query/Criteria | `SalesOrderSearchCriteria` |

禁止使用 `data`、`map`、`obj`、`result1` 等无语义命名。

## 2. Map 与 JSON 禁用规则

1. Controller 禁止 `@RequestBody JsonNode`、`@RequestBody Map<String, Object>`。
2. Service 禁止返回 `Map<String, Object>`。
3. Store/Repository 禁止 `Map<String, JsonNode>` 作为业务聚合缓存。
4. 禁止通过字符串路径读取字段，例如 `data.path("status")`。
5. 禁止 `Map<String, Object> metadata` 这类无 schema 字段；必须定义具名结构。
6. 日志可以输出脱敏 DTO 的 `toString()`，不得手工拼接 Map。
7. 例外：外部系统真实 JSON 协议只允许出现在 Infrastructure Client 的最外层，进入应用前必须转换为具名 DTO。

## 3. DTO 与领域对象

1. Request/Response 使用 `record`，字段使用 Bean Validation 注解。
2. Command/Query 使用 `record`，不包含 Spring Web 注解。
3. JPA Entity 使用具名类和私有 setter 或领域方法。
4. Value Object 使用 `record`，例如 `Money`、`Quantity`、`DocumentNo`。
5. 禁止 Entity 和 Response 直接互转而不经过 Mapper。

示例：

```java
public record ConfirmSalesOrderCommand(
        String tenantId,
        String orderId,
        long expectedVersion,
        String operatorId
) {}
```

```java
public record SalesOrderResponse(
        String orderId,
        String orderNo,
        SalesOrderStatusResponse status,
        BigDecimal totalAmount
) {}
```

## 4. Controller

1. 只负责参数绑定、认证上下文、调用 Application Service 和返回 Response。
2. 使用 `@Valid` 和 `@Validated` 校验。
3. 幂等键、If-Match、租户上下文通过参数对象传入。
4. 不捕获业务异常后自行拼装成功响应。
5. HTTP 状态码必须表达语义：200、201、204、400、401、403、404、409、422、424、500。

## 5. Application Service

1. 方法表示一个用例，不暴露通用 save。
2. 只做编排：读取聚合、执行领域行为、保存、发布事件。
3. 禁止在 Service 中手写 JSON 字符串。
4. 事务注解放放在 Application Service。
5. 一个方法只处理一个业务用例，超过 50 行应拆分领域服务或私有方法。

## 6. Domain

1. 聚合根保护自身不变量。
2. 状态迁移必须提供具名方法，例如 `approve()`、`ship()`、`close()`。
3. 状态字段使用枚举。
4. 数量、金额、版本等使用值对象或明确的领域类型。
5. 集合字段返回不可变集合。

## 7. 异常与响应

1. 业务异常继承统一 `BusinessException`。
2. 每个异常包含稳定错误码、用户消息、建议动作和可重试标识。
3. 全局异常处理器统一输出 `{ data, error }` 结构。
4. 不允许返回 `Map.of("message", ...)`。

## 8. 注释

1. 类和方法必须有用途注释，复杂状态机说明迁移规则。
2. 注释解释“为什么”，不复述“怎么做”。
3. 公共 Repository 和 Service 使用 Javadoc。
4. 临时方案必须带 issue 编号和移除条件。

## 9. 并发与性能

1. Service 必须无状态。
2. 禁止共享可变 Map。
3. 使用数据库唯一约束和乐观锁处理并发。
4. 列表查询必须分页；禁止全量读取后在内存过滤。
5. 新查询必须有 `tenant_id`、状态、排序和时间字段索引方案。

## 10. 测试

1. 每个领域状态机必须有单元测试。
2. Application Service 使用 Repository Test Double 或 Testcontainers。
3. Repository 必须有真实 PostgreSQL 集成测试。
4. API 测试断言具名 JSON 字段，不断言 Map 序列化结果。
