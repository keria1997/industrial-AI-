package com.wanshen.platform.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 销售履约 Controller（读写 FulfillmentStore → PostgreSQL module_document）
 *
 * <p>覆盖 RMA / 客户签收 / 报价 / 客户列表 / 触达设置 / AI 洞察。
 */
@RestController
public class SalesFulfillmentController {

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
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("rmaNo", "RMA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "REQUESTED");
        body.put("tenantId", ctx.tenantId());
        store.rmas(ctx.tenantId()).put(id, mapper.valueToTree(body));
        return body;
    }

    // ===== B-03: 审批 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.approve");
        JsonNode rma = store.rmas(ctx.tenantId()).get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        ObjectNode updated = (ObjectNode) rma;
        updated.put("status", "APPROVED");
        if (body != null && body.containsKey("approvedQty"))
            updated.put("approvedQty", body.get("approvedQty").asText());
        store.rmas(ctx.tenantId()).put(id, updated);
        return mapper.convertValue(updated, Map.class);
    }

    // ===== B-04: RMA 检验 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.inspect");
        JsonNode rma = store.rmas(ctx.tenantId()).get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        ObjectNode updated = (ObjectNode) rma;
        updated.put("status", "INSPECTION_COMPLETED");
        if (body != null) {
            if (body.containsKey("receivedQty")) updated.put("receivedQty", body.get("receivedQty").asText());
            if (body.containsKey("qualifiedQty")) updated.put("qualifiedQty", body.get("qualifiedQty").asText());
            if (body.containsKey("scrapQty")) updated.put("scrapQty", body.get("scrapQty").asText());
        }
        store.rmas(ctx.tenantId()).put(id, updated);
        return mapper.convertValue(updated, Map.class);
    }

    // ===== B-05: 关闭 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.rma.close");
        JsonNode rma = store.rmas(ctx.tenantId()).get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        ObjectNode updated = (ObjectNode) rma;
        updated.put("status", "CLOSED");
        store.rmas(ctx.tenantId()).put(id, updated);
        return mapper.convertValue(updated, Map.class);
    }

    // ===== B-06: 客户签收列表 =====
    @GetMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> listReceipts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        return paged(store.receipts(ctx.tenantId()).values(), page, pageSize);
    }

    // ===== B-07: 登记客户签收 =====
    @PostMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        RequestContext ctx = auth(request);
        require(ctx, "sales.order.read");
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("receiptNo", "CR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "PENDING");
        body.put("tenantId", ctx.tenantId());
        store.receipts(ctx.tenantId()).put(id, mapper.valueToTree(body));
        return body;
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
        store.quotes(ctx.tenantId()).put(id, mapper.valueToTree(body));
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
        var orders = store.orders(ctx.tenantId()).values().stream()
                .filter(o -> !"CANCELED".equals(text(o, "overallStatus")))
                .collect(Collectors.toList());

        var threeDaysAgo = java.time.Instant.now().minusSeconds(3 * 86400);
        List<Map<String, Object>> stalled = orders.stream()
                .filter(o -> "PENDING_CONFIRMATION".equals(text(o, "overallStatus")))
                .filter(o -> {
                    var c = text(o, "createdAt");
                    if (c.isBlank()) return false;
                    try { return java.time.Instant.parse(c).isBefore(threeDaysAgo); }
                    catch (RuntimeException e) { return false; }
                })
                .map(o -> Map.<String, Object>of(
                        "orderId", text(o, "orderNo"), "customerName", text(o, "customerName"),
                        "totalAmount", text(o, "totalAmount")))
                .collect(Collectors.toList());

        var threeDaysLater = java.time.LocalDate.now().plusDays(3);
        List<Map<String, Object>> deliveryRisk = orders.stream()
                .filter(o -> {
                    var s = text(o, "overallStatus");
                    if (Set.of("SHIPPED", "COMPLETED", "CANCELED").contains(s)) return false;
                    var d = text(o, "requestedDeliveryDate");
                    if (d.isBlank()) return false;
                    try { return java.time.LocalDate.parse(d.substring(0, 10)).isBefore(threeDaysLater); }
                    catch (RuntimeException e) { return false; }
                })
                .map(o -> Map.<String, Object>of(
                        "orderId", text(o, "orderNo"), "customerName", text(o, "customerName"),
                        "deliveryDate", text(o, "requestedDeliveryDate")))
                .collect(Collectors.toList());

        var totalSales = orders.stream()
                .map(o -> { try { return new java.math.BigDecimal(text(o, "totalAmount", "0")); } catch (RuntimeException e) { return java.math.BigDecimal.ZERO; } })
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stalledOrders", stalled);
        result.put("deliveryRiskOrders", deliveryRisk);
        result.put("totalSalesAmount", totalSales.toPlainString());
        result.put("monthlyOrderCount", orders.size());
        result.put("stalledCount", stalled.size());
        result.put("deliveryRiskCount", deliveryRisk.size());
        result.put("dataAsOf", java.time.Instant.now().toString());
        result.put("generatedAt", java.time.Instant.now().toString());
        return result;
    }
}
