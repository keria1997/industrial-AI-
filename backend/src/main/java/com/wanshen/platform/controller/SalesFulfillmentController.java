package com.wanshen.platform.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 销售履约 Controller
 *
 * <p>覆盖前端 RmaManagementPanel / CustomerReceiptPanel / Sales_QuotesView / Sales_CustomersView
 * <p>路径: /api/v1/fulfillment/* 和 /api/v2/sales/quotes
 * <p>当前使用内存存储（重启丢失），后续替换为 JPA 持久化。
 */
@RestController
public class SalesFulfillmentController {

    private final ObjectMapper mapper;
    private final Map<String, Map<String, Object>> rmaStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> receiptStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> quoteStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> customerStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> outreachStore = new ConcurrentHashMap<>();

    public SalesFulfillmentController(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Autowired
    public void setContexts(RequestContextService contexts) {
        this.contexts = contexts;
    }

    private RequestContext auth(HttpServletRequest request) {
        return contexts.from(request);
    }

    private RequestContextService contexts;

    private void requireScope(RequestContext ctx, String permission) {
        if (ctx.permissions() == null || (!ctx.permissions().contains("*") && !ctx.permissions().contains(permission))) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "无权访问此资源", "所需权限: " + permission);
        }
    }

    private Map<String, Object> paged(List<Map<String, Object>> items, int page, int pageSize) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("items", items);
        r.put("total", items.size());
        r.put("page", page);
        r.put("pageSize", pageSize);
        return r;
    }

    // ===== B-01 =====
    @GetMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> listRmas(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize, HttpServletRequest request) {
        auth(request);
        return paged(new ArrayList<>(rmaStore.values()), page, pageSize);
    }

    // ===== B-02 =====
    @PostMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> createRma(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("rmaNo", "RMA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "REQUESTED");
        rmaStore.put(id, body);
        return body;
    }

    // ===== B-03 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        Map<String, Object> rma = rmaStore.get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        rma.put("status", "APPROVED");
        if (body != null && body.containsKey("approvedQty")) rma.put("approvedQty", body.get("approvedQty"));
        return rma;
    }

    // ===== B-04 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        Map<String, Object> rma = rmaStore.get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        rma.put("status", "INSPECTION_COMPLETED");
        if (body != null) rma.putAll(body);
        return rma;
    }

    // ===== B-05 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id, HttpServletRequest request) {
        auth(request);
        Map<String, Object> rma = rmaStore.get(id);
        if (rma == null) throw new ApiException(404, "SALES_404_NOT_FOUND", "RMA不存在: " + id, "检查ID");
        rma.put("status", "CLOSED");
        return rma;
    }

    // ===== B-06 =====
    @GetMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> listReceipts(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize, HttpServletRequest request) {
        auth(request);
        return paged(new ArrayList<>(receiptStore.values()), page, pageSize);
    }

    // ===== B-07 =====
    @PostMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("receiptNo", "CR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "PENDING");
        receiptStore.put(id, body);
        return body;
    }

    // ===== B-08 =====
    @GetMapping("/api/v2/sales/quotes")
    public Map<String, Object> listQuotes(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize, HttpServletRequest request) {
        auth(request);
        return paged(new ArrayList<>(quoteStore.values()), page, pageSize);
    }

    // ===== B-09 =====
    @PostMapping("/api/v2/sales/quotes")
    public Map<String, Object> createQuote(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("quoteNo", "QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "DRAFT");
        quoteStore.put(id, body);
        return body;
    }

    // ===== B-10 =====
    @GetMapping("/api/v1/fulfillment/customers")
    public Map<String, Object> listCustomers(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize, HttpServletRequest request) {
        auth(request);
        return paged(new ArrayList<>(customerStore.values()), page, pageSize);
    }

    // ===== 触达设置 =====
    @GetMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> getOutreachSettings(HttpServletRequest request) {
        auth(request);
        Map<String, Object> settings = outreachStore.get("default");
        if (settings == null) {
            settings = new LinkedHashMap<>();
            settings.put("thresholdDays", 3);
            settings.put("reminderEnabled", true);
        }
        return settings;
    }

    @PutMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> updateOutreachSettings(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        auth(request);
        outreachStore.put("default", body);
        return body;
    }

    // ===== AI 洞察 =====
    @GetMapping("/api/v1/sales/ai-insights")
    public Map<String, Object> aiInsights(HttpServletRequest request) {
        auth(request);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stalledOrders", List.of());
        result.put("deliveryRiskOrders", List.of());
        result.put("totalSalesAmount", "0");
        result.put("monthlyOrderCount", 0);
        result.put("stalledCount", 0);
        result.put("deliveryRiskCount", 0);
        result.put("riskyQuotes", List.of());
        result.put("generatedAt", java.time.Instant.now().toString());
        result.put("dataAsOf", java.time.Instant.now().toString());
        return result;
    }
}
