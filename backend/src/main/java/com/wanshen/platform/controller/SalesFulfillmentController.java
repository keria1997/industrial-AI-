package com.wanshen.platform.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.fulfillment.SalesAftercareService;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 销售履约 Controller（读写 FulfillmentStore → PostgreSQL module_document）
 *
 * <p>覆盖 RMA / 客户签收 / 报价 / 客户列表 / 触达设置 / AI 洞察。
 */
@RestController
public class SalesFulfillmentController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private final FulfillmentStore store;
    private final ObjectMapper mapper;
    private final RequestContextService contexts;
    private final SalesAftercareService aftercare;

    public SalesFulfillmentController(
            FulfillmentStore store,
            SalesAftercareService aftercare,
            ObjectMapper mapper,
            RequestContextService contexts
    ) {
        this.store = store;
        this.mapper = mapper;
        this.contexts = contexts;
        this.aftercare = aftercare;
    }

    private RequestContext auth(HttpServletRequest request) {
        return contexts.from(request);
    }

    private void require(RequestContext ctx, String permission) {
        if (ctx.permissions() == null || (!ctx.permissions().contains("*") && !ctx.permissions().contains(permission))) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "无权访问此资源", "所需权限: " + permission);
        }
    }

    private Map<String, Object> paged(Collection<JsonNode> items, int page, int pageSize) {
        List<JsonNode> list = new ArrayList<>(items);
        int from = Math.min((page - 1) * pageSize, list.size());
        int to = Math.min(from + pageSize, list.size());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("items", list.subList(from, to));
        r.put("total", list.size());
        r.put("page", page);
        r.put("pageSize", pageSize);
        return r;
    }

    private String text(JsonNode v, String f) {
        return v != null && v.hasNonNull(f) ? v.get(f).asText() : "";
    }

    private String text(JsonNode v, String f, String defaultValue) {
        String value = text(v, f);
        return value.isBlank() ? defaultValue : value;
    }

    private ApiException rmaNotFound(String id) {
        return new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
    }

    private Map<String, Object> toMap(JsonNode value) {
        return mapper.convertValue(value, new TypeReference<Map<String, Object>>() { });
    }

    private String requireIdempotencyKey(RequestContext ctx, String commandType) {
        if (ctx.idempotencyKey() == null || ctx.idempotencyKey().isBlank()) {
            throw new ApiException(400, "SALES_400_IDEMPOTENCY_KEY_REQUIRED",
                    commandType + "缺少 X-Idempotency-Key", "请求头携带唯一的 X-Idempotency-Key");
        }
        return ctx.idempotencyKey();
    }

    private Optional<Map<String, Object>> replayCommand(
            RequestContext ctx, String commandType, String idempotencyKey, Map<String, Object> body) {
        return store.idempotency(ctx.tenantId(), commandType, idempotencyKey)
                .filter(record -> requestHash(commandType, body).equals(record.path("requestHash").asText()))
                .map(record -> toMap(record.path("body")));
    }

    private void rejectCommandKeyConflict(
            RequestContext ctx, String commandType, String idempotencyKey, Map<String, Object> body) {
        store.idempotency(ctx.tenantId(), commandType, idempotencyKey).ifPresent(record -> {
            if (!requestHash(commandType, body).equals(record.path("requestHash").asText())) {
                throw new ApiException(409, "SALES_409_IDEMPOTENCY_CONFLICT",
                        "幂等键已被不同请求使用", "更换 X-Idempotency-Key 后重试");
            }
        });
    }

    private void saveCommandIdempotency(
            RequestContext ctx, String commandType, String idempotencyKey,
            Map<String, Object> commandBody, JsonNode responseBody) {
        store.saveIdempotency(ctx.tenantId(), commandType, idempotencyKey,
                requestHash(commandType, commandBody), 200, responseBody);
    }

    private String requestHash(String commandType, Map<String, Object> body) {
        try {
            String payload = commandType + ":" + mapper.writeValueAsString(body == null ? Map.of() : body);
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to calculate command hash", exception);
        }
    }

    private void requireVersion(RequestContext ctx, Map<String, Object> body, JsonNode current) {
        int expectedVersion = ctx.expectedVersion() != null ? ctx.expectedVersion() :
                (body.containsKey("version") ? Integer.parseInt(String.valueOf(body.get("version"))) : -1);
        int currentVersion = current.path("version").asInt(1);
        if (expectedVersion >= 0 && expectedVersion != currentVersion) {
            throw new ApiException(409, "SALES_409_VERSION_CONFLICT", "单据已被其他人修改",
                    "刷新后使用版本 " + currentVersion + " 重试");
        }
    }

    private void touch(ObjectNode value, String actorId) {
        value.put("version", value.path("version").asInt(1) + 1)
                .put("updatedBy", actorId)
                .put("updatedAt", Instant.now().toString());
    }

    private BigDecimal positiveDecimal(Map<String, Object> body, String field) {
        BigDecimal value = nonNegativeDecimal(body, field);
        if (value.signum() <= 0) {
            throw new ApiException(422, "SALES_422_INVALID_QTY", field + "必须大于0", "检查业务数量");
        }
        return value;
    }

    private BigDecimal nonNegativeDecimal(Map<String, Object> body, String field) {
        Object value = body.get(field);
        if (value == null || String.valueOf(value).isBlank()) {
            throw new ApiException(422, "SALES_422_INVALID_QTY", field + "不能为空", "检查业务数量");
        }
        try {
            BigDecimal result = new BigDecimal(String.valueOf(value));
            if (result.signum() < 0) throw new NumberFormatException();
            return result;
        } catch (NumberFormatException exception) {
            throw new ApiException(422, "SALES_422_INVALID_QTY", field + "必须是大于等于0的数字", "检查业务数量");
        }
    }

    private BigDecimal decimal(JsonNode value, String field) {
        String text = text(value, field);
        try {
            return text.isBlank() ? BigDecimal.ZERO : new BigDecimal(text);
        } catch (NumberFormatException exception) {
            return BigDecimal.ZERO;
        }
    }

    private String nextDocumentNo(String prefix) {
        return prefix + "-" + Long.toString(System.currentTimeMillis(), 36).toUpperCase(Locale.ROOT)
                + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    private String requiredText(Map<String, Object> body, String field) {
        Object value = body.get(field);
        if (value == null || String.valueOf(value).isBlank()) {
            throw new ApiException(422, "SALES_422_FIELD_REQUIRED", field + "不能为空", "检查必填字段");
        }
        return String.valueOf(value);
    }

    private String receiptStatus(BigDecimal signed, BigDecimal rejected, BigDecimal damaged, BigDecimal shipped) {
        if (signed.add(rejected).add(damaged).compareTo(shipped) < 0) return "PARTIALLY_SIGNED";
        if (signed.signum() == 0 && rejected.signum() > 0) return "REJECTED";
        if (rejected.signum() > 0 || damaged.signum() > 0) return "DISPUTED";
        return "SIGNED";
    }

    // ===== B-01: RMA 列表 =====
    @GetMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> listRmas(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        return paged(store.rmas(ctx.tenantId()).values(), page, pageSize);
    }

    // ===== PRD RMA 命令：创建和统一 transition =====
    @PostMapping("/api/v1/rmas")
    public Map<String, Object> createRma(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return aftercare.createRma(auth(request), body);
    }

    @PostMapping("/api/v1/rmas/{id}/transition")
    public Map<String, Object> transitionRma(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        return aftercare.transitionRma(auth(request), id, body);
    }

    // Retired compatibility endpoint. The PRD requires the source-line RMA transition contract.
    @PostMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> createLegacyRma(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/rmas");
    }

    @Deprecated
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/rmas/" + id + "/transition");
    }

    @Deprecated
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/rmas/" + id + "/transition");
    }

    @Deprecated
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/rmas/" + id + "/transition");
    }

    // ===== B-06: 客户签收列表 =====
    @GetMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> listReceipts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.receipt.read");
        return paged(store.receipts(ctx.tenantId()).values(), page, pageSize);
    }

    // ===== PRD 客户签收与销售完成 =====
    @PostMapping("/api/v1/sales-orders/{orderId}/receipts")
    public Map<String, Object> createOrderReceipt(
            @PathVariable String orderId,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        return aftercare.createReceipt(auth(request), orderId, body);
    }

    @PostMapping("/api/v1/sales-orders/{orderId}/complete-check")
    public Map<String, Object> completeCheck(
            @PathVariable String orderId,
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request
    ) {
        return aftercare.completeCheck(auth(request), orderId, body == null ? Map.of() : body);
    }

    @PostMapping("/api/v1/sales-orders/{orderId}/complete")
    public Map<String, Object> completeOrder(
            @PathVariable String orderId,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        return aftercare.complete(auth(request), orderId, body);
    }

    @Deprecated
    @PostMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/sales-orders/{orderId}/receipts");
    }

    // ===== PRD 销售 SLA 规则与通知 =====
    @GetMapping("/api/v1/sales/sla-rules")
    public List<Map<String, Object>> listSlaRules(HttpServletRequest request) {
        return aftercare.slaRules(auth(request));
    }

    @PostMapping("/api/v1/sales/sla-rules")
    public Map<String, Object> createSlaRule(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        require(auth(request), "sales.settings.manage");
        return aftercare.saveSlaRule(auth(request), null, body);
    }

    @PatchMapping("/api/v1/sales/sla-rules/{id}")
    public Map<String, Object> updateSlaRule(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        require(auth(request), "sales.settings.manage");
        return aftercare.saveSlaRule(auth(request), id, body);
    }

    @GetMapping("/api/v1/sales/sla-notifications")
    public List<Map<String, Object>> listSlaNotifications(HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        return aftercare.slaNotifications(ctx);
    }

    // ===== B-08: 报价列表 =====
    @GetMapping("/api/v1/fulfillment/quotes")
    public Map<String, Object> listQuotes(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.quote.read");
        return paged(store.quotes(ctx.tenantId()).values(), page, pageSize);
    }

    // ===== B-09: 创建报价 =====
    @PostMapping("/api/v1/fulfillment/quotes")
    public Map<String, Object> createQuote(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.quote.create");
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("quoteNo", "QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "DRAFT");
        body.put("tenantId", ctx.tenantId());
        store.saveQuote(mapper.valueToTree(body));
        return body;
    }

    // ===== B-10: 客户列表 =====
    @GetMapping("/api/v1/fulfillment/customers")
    public Map<String, Object> listCustomers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.customer.read");
        return paged(store.customers(ctx.tenantId()).values(), page, pageSize);
    }

    // ===== 触达设置 =====
    @Deprecated
    @GetMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> getOutreachSettings(HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/sales/sla-rules");
    }

    @Deprecated
    @PutMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> updateOutreachSettings(
            @RequestBody Map<String, Object> body, HttpServletRequest request) {
        throw legacyCommandRetired("/api/v1/sales/sla-rules");
    }

    // ===== AI 洞察（从 Store 订单数据计算） =====
    @GetMapping("/api/v1/sales/ai-insights")
    public Map<String, Object> aiInsights(HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        try {
            List<JsonNode> orders = store.orders(ctx.tenantId());
            if (orders.isEmpty()) return insights("EMPTY", null, null, null, 0, null,
                    0, 0, List.of(), List.of(), 0);

            Set<String> currencies = orders.stream().map(order -> text(order, "currency"))
                    .filter(value -> value.matches("[A-Z]{3}")).collect(Collectors.toSet());
            if (currencies.size() != 1) {
                return insights("UNAVAILABLE", null, null, null, 0, null, 0, 0,
                        List.of(), List.of(), orders.size());
            }
            String currency = currencies.iterator().next();
            String dataAsOf = orders.stream().map(this::orderFactTime)
                    .filter(Optional::isPresent).map(Optional::get).max(Instant::compareTo)
                    .map(Instant::toString).orElse(null);
            if (dataAsOf == null) return insights("UNAVAILABLE", currency, null, null, 0, null,
                    0, 0, List.of(), List.of(), orders.size());

            YearMonth currentMonth = YearMonth.now(ZONE);
            List<JsonNode> monthlyOrders = orders.stream().filter(order -> monthOf(orderFactTime(order))
                    .map(currentMonth::equals).orElse(false)).toList();
            BigDecimal totalSalesAmount = monthlyOrders.stream()
                    .map(order -> decimal(order, "totalAmount")).reduce(BigDecimal.ZERO, BigDecimal::add);
            Instant stalledBefore = Instant.now().minus(Duration.ofHours(slaThresholdHours(ctx)));
            List<Map<String, Object>> stalledOrders = orders.stream()
                    .filter(order -> "PENDING_CONFIRMATION".equals(text(order, "overallStatus")))
                    .filter(order -> orderFactTime(order).map(time -> time.isBefore(stalledBefore)).orElse(false))
                    .map(order -> Map.<String, Object>of(
                            "orderId", text(order, "id"), "orderNo", text(order, "orderNo"),
                            "customerName", text(order, "customerName"),
                            "totalAmount", decimal(order, "totalAmount").toPlainString()))
                    .toList();
            LocalDate deliveryRiskLimit = LocalDate.now(ZONE).plusDays(3);
            List<JsonNode> riskyOrders = orders.stream()
                    .filter(order -> OPEN_DELIVERY_STATES.contains(text(order, "overallStatus")))
                    .filter(order -> {
                        String date = text(order, "requestedDeliveryDate");
                        return !date.isBlank();
                    })
                    .filter(order -> !parseDate(text(order, "requestedDeliveryDate")).isAfter(deliveryRiskLimit))
                    .toList();
            List<Map<String, Object>> deliveryRiskOrders = riskyOrders.stream().map(order -> {
                LocalDate dueDate = parseDate(text(order, "requestedDeliveryDate"));
                long overdueDays = Math.max(0, LocalDate.now(ZONE).toEpochDay() - dueDate.toEpochDay());
                String severity = overdueDays == 0 ? "MEDIUM" : overdueDays <= 7 ? "HIGH" : "CRITICAL";
                Map<String, Object> item = new LinkedHashMap<String, Object>();
                item.put("orderId", text(order, "id"));
                item.put("orderNo", text(order, "orderNo"));
                item.put("customerName", text(order, "customerName"));
                item.put("deliveryDate", text(order, "requestedDeliveryDate"));
                item.put("overallStatus", text(order, "overallStatus"));
                item.put("severity", severity);
                item.put("overdueDays", overdueDays);
                return item;
            }).toList();
            int invalidAmounts = (int) monthlyOrders.stream()
                    .filter(order -> text(order, "totalAmount").isBlank()
                            || !text(order, "totalAmount").matches("\\d+(\\.\\d+)?")).count();
            return insights("AVAILABLE", currency, dataAsOf, "sales-order-v1",
                    monthlyOrders.size(), totalSalesAmount.stripTrailingZeros().toPlainString(),
                    stalledOrders.size(), deliveryRiskOrders.size(), stalledOrders, deliveryRiskOrders,
                    invalidAmounts);
        } catch (RuntimeException exception) {
            return insights("UNAVAILABLE", null, null, null, 0, null, 0, 0,
                    List.of(), List.of(), 0);
        }
    }

    private Map<String, Object> insights(
            String availability, String currency, String dataAsOf, String sourceVersion,
            int monthlyOrderCount, String totalSalesAmount, int stalledCount, int deliveryRiskCount,
            List<Map<String, Object>> stalledOrders, List<Map<String, Object>> deliveryRiskOrders,
            int incompleteFactCount
    ) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("availability", availability);
        result.put("businessDate", LocalDate.now(ZONE).toString());
        result.put("timeZone", ZONE.getId());
        result.put("currency", currency);
        result.put("dataAsOf", dataAsOf);
        result.put("sourceVersion", sourceVersion);
        result.put("monthlyOrderCount", "UNAVAILABLE".equals(availability) ? null : monthlyOrderCount);
        result.put("totalSalesAmount", "UNAVAILABLE".equals(availability) ? null : totalSalesAmount);
        result.put("stalledCount", "UNAVAILABLE".equals(availability) ? null : stalledCount);
        result.put("deliveryRiskCount", "UNAVAILABLE".equals(availability) ? null : deliveryRiskCount);
        result.put("stalledOrders", stalledOrders);
        result.put("deliveryRiskOrders", deliveryRiskOrders);
        result.put("metricCompleteness", incompleteFactCount == 0 ? "COMPLETE" : "INCOMPLETE");
        result.put("incompleteFactCount", incompleteFactCount);
        result.put("generatedAt", Instant.now().toString());
        return result;
    }

    private long slaThresholdHours(RequestContext ctx) {
        return store.slaRules(ctx.tenantId()).values().stream()
                .filter(rule -> "PENDING_CONFIRMATION".equals(text(rule, "listenStatus")))
                .filter(rule -> rule.path("enabled").asBoolean(true))
                .findFirst().map(rule -> rule.path("timeoutThresholdHours").asLong(72)).orElse(72L);
    }

    private static final Set<String> OPEN_DELIVERY_STATES = Set.of(
            "PENDING_CONFIRMATION", "CONFIRMED", "REPLENISHING", "PARTIALLY_SHIPPED");

    private ApiException legacyCommandRetired(String canonicalPath) {
        return new ApiException(410, "SALES_410_LEGACY_COMMAND_RETIRED",
                "旧命令已下线，请使用PRD契约接口", "调用 " + canonicalPath);
    }

    private Optional<Instant> orderFactTime(JsonNode order) {
        String value = !text(order, "updatedAt").isBlank() ? text(order, "updatedAt") : text(order, "createdAt");
        try {
            return value.isBlank() ? Optional.empty() : Optional.of(Instant.parse(value));
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private Optional<YearMonth> monthOf(Optional<Instant> time) {
        return time.map(value -> YearMonth.from(value.atZone(ZONE)));
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value.substring(0, 10));
        } catch (RuntimeException exception) {
            return LocalDate.MAX;
        }
    }
}
