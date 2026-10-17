package com.wanshen.platform.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.fulfillment.FulfillmentStore;
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

    public SalesFulfillmentController(FulfillmentStore store, ObjectMapper mapper, RequestContextService contexts) {
        this.store = store;
        this.mapper = mapper;
        this.contexts = contexts;
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

    // ===== B-02: 创建 RMA =====
    @PostMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> createRma(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.create");
        String idempotencyKey = requireIdempotencyKey(ctx, "RMA_CREATE");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replayCommand(ctx, "RMA_CREATE", idempotencyKey, body);
            if (replay.isPresent()) return replay.get();
            rejectCommandKeyConflict(ctx, "RMA_CREATE", idempotencyKey, body);
            String orderId = requiredText(body, "orderId");
            if (store.order(ctx.tenantId(), orderId).isEmpty()) {
                throw new ApiException(422, "SALES_422_ORDER_NOT_FOUND",
                        "销售订单不存在: " + orderId, "检查 orderId 后重试");
            }
            String id = UUID.randomUUID().toString();
            ObjectNode value = mapper.valueToTree(body).deepCopy();
            BigDecimal requestedQty = positiveDecimal(body, "requestedQty");
            value.put("id", id);
            value.put("rmaNo", nextDocumentNo("RMA"));
            value.put("status", "REQUESTED");
            value.put("tenantId", ctx.tenantId());
            value.put("requestedQty", requestedQty.toPlainString());
            value.put("approvedQty", BigDecimal.ZERO.toPlainString());
            value.put("version", 1);
            value.put("createdBy", ctx.actorId());
            value.put("createdAt", Instant.now().toString());
            value.put("updatedAt", Instant.now().toString());
            store.saveRma(value);
            saveCommandIdempotency(ctx, "RMA_CREATE", idempotencyKey, body, value);
            return mapper.convertValue(value, new TypeReference<Map<String, Object>>() { });
        });
    }

    // ===== B-03: 审批 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.approve");
        Map<String, Object> command = body == null ? Map.of() : body;
        String idempotencyKey = requireIdempotencyKey(ctx, "RMA_APPROVE");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replayCommand(ctx, "RMA_APPROVE", idempotencyKey, command);
            if (replay.isPresent()) return replay.get();
            rejectCommandKeyConflict(ctx, "RMA_APPROVE", idempotencyKey, command);
            JsonNode current = store.get(ctx.tenantId(), id, store.rmas(ctx.tenantId()))
                    .orElseThrow(() -> rmaNotFound(id));
            requireVersion(ctx, command, current);
            if (!"REQUESTED".equals(text(current, "status"))) {
                throw new ApiException(409, "SALES_409_RMA_STATE", "RMA当前状态不允许审批",
                        "只有 REQUESTED 状态可以审批");
            }
            BigDecimal approvedQty = positiveDecimal(command, "approvedQty");
            if (approvedQty.compareTo(decimal(current, "requestedQty")) > 0) {
                throw new ApiException(422, "SALES_422_RMA_QTY", "审批数量不能超过申请数量", "检查 approvedQty");
            }
            ObjectNode updated = current.deepCopy();
            updated.put("status", "APPROVED").put("approvedQty", approvedQty.toPlainString());
            touch(updated, ctx.actorId());
            store.saveRma(updated);
            saveCommandIdempotency(ctx, "RMA_APPROVE", idempotencyKey, command, updated);
            return toMap(updated);
        });
    }

    // ===== B-04: RMA 检验 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.inspect");
        Map<String, Object> command = body == null ? Map.of() : body;
        String idempotencyKey = requireIdempotencyKey(ctx, "RMA_INSPECT");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replayCommand(ctx, "RMA_INSPECT", idempotencyKey, command);
            if (replay.isPresent()) return replay.get();
            rejectCommandKeyConflict(ctx, "RMA_INSPECT", idempotencyKey, command);
            JsonNode current = store.get(ctx.tenantId(), id, store.rmas(ctx.tenantId()))
                    .orElseThrow(() -> rmaNotFound(id));
            requireVersion(ctx, command, current);
            if (!"APPROVED".equals(text(current, "status"))) {
                throw new ApiException(409, "SALES_409_RMA_STATE", "RMA当前状态不允许检验",
                        "只有 APPROVED 状态可以录入检验结果");
            }
            BigDecimal receivedQty = nonNegativeDecimal(command, "receivedQty");
            BigDecimal qualifiedQty = nonNegativeDecimal(command, "qualifiedQty");
            BigDecimal scrapQty = nonNegativeDecimal(command, "scrapQty");
            if (qualifiedQty.add(scrapQty).compareTo(receivedQty) != 0) {
                throw new ApiException(422, "SALES_422_INSPECTION_QTY",
                        "合格数量加报废数量必须等于实收数量", "检查 receivedQty、qualifiedQty、scrapQty");
            }
            if (receivedQty.compareTo(decimal(current, "approvedQty")) != 0) {
                throw new ApiException(422, "SALES_422_RECEIVE_QTY",
                        "实收数量必须等于审批数量", "检查 receivedQty");
            }
            ObjectNode updated = current.deepCopy();
            updated.put("status", "INSPECTION_COMPLETED")
                    .put("receivedQty", receivedQty.toPlainString())
                    .put("qualifiedQty", qualifiedQty.toPlainString())
                    .put("scrapQty", scrapQty.toPlainString());
            touch(updated, ctx.actorId());
            store.saveRma(updated);
            saveCommandIdempotency(ctx, "RMA_INSPECT", idempotencyKey, command, updated);
            return toMap(updated);
        });
    }

    // ===== B-05: 关闭 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.close");
        String idempotencyKey = requireIdempotencyKey(ctx, "RMA_CLOSE");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replayCommand(ctx, "RMA_CLOSE", idempotencyKey, Map.of());
            if (replay.isPresent()) return replay.get();
            rejectCommandKeyConflict(ctx, "RMA_CLOSE", idempotencyKey, Map.of());
            JsonNode current = store.get(ctx.tenantId(), id, store.rmas(ctx.tenantId()))
                    .orElseThrow(() -> rmaNotFound(id));
            requireVersion(ctx, Map.of(), current);
            if (!"INSPECTION_COMPLETED".equals(text(current, "status"))) {
                throw new ApiException(409, "SALES_409_RMA_STATE", "RMA当前状态不允许关闭",
                        "只有检验完成的 RMA 可以关闭");
            }
            ObjectNode updated = current.deepCopy();
            if (text(updated, "creditArId").isBlank()) {
                // Finance consumes this command id through the fulfillment outbox worker integration.
                updated.put("creditArId", "ar-rma-" + id);
                updated.put("creditArAmount", decimal(current, "requestedQty").negate().toPlainString());
            }
            updated.put("status", "CLOSED");
            touch(updated, ctx.actorId());
            store.saveRma(updated);
            saveCommandIdempotency(ctx, "RMA_CLOSE", idempotencyKey, Map.of(), updated);
            return toMap(updated);
        });
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

    // ===== B-07: 登记客户签收 =====
    @PostMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.receipt.create");
        String idempotencyKey = requireIdempotencyKey(ctx, "RECEIPT_CREATE");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replayCommand(ctx, "RECEIPT_CREATE", idempotencyKey, body);
            if (replay.isPresent()) return replay.get();
            rejectCommandKeyConflict(ctx, "RECEIPT_CREATE", idempotencyKey, body);
            String orderId = requiredText(body, "orderId");
            if (store.order(ctx.tenantId(), orderId).isEmpty()) {
                throw new ApiException(422, "SALES_422_ORDER_NOT_FOUND",
                        "销售订单不存在: " + orderId, "检查 orderId 后重试");
            }
            BigDecimal signedQty = nonNegativeDecimal(body, "signedQty");
            BigDecimal rejectedQty = nonNegativeDecimal(body, "rejectedQty");
            BigDecimal damagedQty = nonNegativeDecimal(body, "damagedQty");
            BigDecimal totalShippedQty = nonNegativeDecimal(body, "totalShippedQty");
            if (signedQty.add(rejectedQty).add(damagedQty).compareTo(totalShippedQty) > 0) {
                throw new ApiException(422, "SALES_422_RECEIPT_QTY",
                        "签收、拒收和破损合计不能超过发货总量", "检查签收数量");
            }
            String id = UUID.randomUUID().toString();
            ObjectNode value = mapper.valueToTree(body).deepCopy();
            value.put("id", id);
            value.put("receiptNo", nextDocumentNo("CR"));
            value.put("status", receiptStatus(signedQty, rejectedQty, damagedQty, totalShippedQty));
            value.put("tenantId", ctx.tenantId());
            value.put("version", 1);
            value.put("createdAt", Instant.now().toString());
            value.put("updatedAt", Instant.now().toString());
            store.saveReceipt(value);
            saveCommandIdempotency(ctx, "RECEIPT_CREATE", idempotencyKey, body, value);
            return toMap(value);
        });
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
    @GetMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> getOutreachSettings(HttpServletRequest request) {
        auth(request);
        return Map.of("thresholdDays", 3, "reminderEnabled", true);
    }

    @PutMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> updateOutreachSettings(
            @RequestBody Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        return body;
    }

    // ===== AI 洞察（从 Store 订单数据计算） =====
    @GetMapping("/api/v1/sales/ai-insights")
    public Map<String, Object> aiInsights(HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        try {
            List<JsonNode> orders = store.orders(ctx.tenantId()).stream()
                    .filter(order -> !"CANCELED".equals(text(order, "overallStatus")))
                    .toList();
            if (orders.isEmpty()) return insightResult("EMPTY", null, null, null, null, List.of(), List.of());

            Set<String> currencies = orders.stream().map(order -> text(order, "currency"))
                    .filter(value -> value.matches("[A-Z]{3}")).collect(Collectors.toSet());
            if (currencies.size() != 1) {
                return insightResult("UNAVAILABLE", null, null, null, null, List.of(), List.of());
            }
            String currency = currencies.iterator().next();
            String dataAsOf = orders.stream().map(this::orderFactTime)
                    .filter(Optional::isPresent).map(Optional::get).max(Instant::compareTo)
                    .map(Instant::toString).orElse(null);
            if (dataAsOf == null) return insightResult("UNAVAILABLE", currency, null, null, null, List.of(), List.of());

            YearMonth currentMonth = YearMonth.now(ZONE);
            List<JsonNode> monthlyOrders = orders.stream().filter(order -> monthOf(orderFactTime(order))
                    .map(currentMonth::equals).orElse(false)).toList();
            BigDecimal totalSalesAmount = monthlyOrders.stream()
                    .map(order -> decimal(order, "totalAmount")).reduce(BigDecimal.ZERO, BigDecimal::add);
            Instant stalledBefore = Instant.now().minus(Duration.ofDays(outreachThreshold(ctx)));
            List<Map<String, Object>> stalledOrders = monthlyOrders.stream()
                    .filter(order -> "PENDING_CONFIRMATION".equals(text(order, "overallStatus")))
                    .filter(order -> orderFactTime(order).map(time -> time.isBefore(stalledBefore)).orElse(false))
                    .map(order -> Map.<String, Object>of(
                            "orderId", text(order, "orderNo"), "customerName", text(order, "customerName"),
                            "totalAmount", decimal(order, "totalAmount").toPlainString()))
                    .toList();
            LocalDate deliveryRiskLimit = LocalDate.now(ZONE).plusDays(3);
            List<Map<String, Object>> deliveryRiskOrders = monthlyOrders.stream()
                    .filter(order -> !Set.of("SHIPPED", "COMPLETED", "CANCELED").contains(text(order, "overallStatus")))
                    .filter(order -> {
                        String date = text(order, "requestedDeliveryDate");
                        return !date.isBlank() && !parseDate(date).isAfter(deliveryRiskLimit);
                    })
                    .map(order -> Map.<String, Object>of(
                            "orderId", text(order, "orderNo"), "customerName", text(order, "customerName"),
                            "deliveryDate", text(order, "requestedDeliveryDate")))
                    .toList();
            Map<String, Object> result = insightResult("AVAILABLE", currency, dataAsOf, "sales-order-v1",
                    monthlyOrders, stalledOrders, deliveryRiskOrders);
            result.put("totalSalesAmount", totalSalesAmount.stripTrailingZeros().toPlainString());
            return result;
        } catch (RuntimeException exception) {
            return insightResult("UNAVAILABLE", null, null, null, null, List.of(), List.of());
        }
    }

    private Map<String, Object> insightResult(
            String availability, String currency, String dataAsOf, String sourceVersion,
            List<JsonNode> monthlyOrders, List<Map<String, Object>> stalledOrders,
            List<Map<String, Object>> deliveryRiskOrders) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("availability", availability);
        result.put("currency", currency);
        result.put("dataAsOf", dataAsOf);
        result.put("sourceVersion", sourceVersion);
        result.put("monthlyOrderCount", "UNAVAILABLE".equals(availability)
                ? null : (monthlyOrders == null ? 0 : monthlyOrders.size()));
        result.put("totalSalesAmount", availability.equals("AVAILABLE") && monthlyOrders != null
                ? monthlyOrders.stream().map(order -> decimal(order, "totalAmount"))
                        .reduce(BigDecimal.ZERO, BigDecimal::add).toPlainString() : null);
        result.put("stalledCount", "UNAVAILABLE".equals(availability)
                ? null : (stalledOrders == null ? 0 : stalledOrders.size()));
        result.put("deliveryRiskCount", "UNAVAILABLE".equals(availability)
                ? null : (deliveryRiskOrders == null ? 0 : deliveryRiskOrders.size()));
        result.put("stalledOrders", stalledOrders == null ? List.of() : stalledOrders);
        result.put("deliveryRiskOrders", deliveryRiskOrders == null ? List.of() : deliveryRiskOrders);
        result.put("generatedAt", Instant.now().toString());
        return result;
    }

    private int outreachThreshold(RequestContext ctx) {
        return store.outreachSettings(ctx.tenantId()).entrySet().stream()
                .findFirst().map(entry -> entry.getValue().path("thresholdDays").asInt(3)).orElse(3);
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
