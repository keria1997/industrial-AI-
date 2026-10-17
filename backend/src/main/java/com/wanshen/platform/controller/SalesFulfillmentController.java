package com.wanshen.platform.controller;

import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 销售履约 Controller
 *
 * <p>覆盖前端 RmaManagementPanel / CustomerReceiptPanel / Sales_QuotesView / Sales_CustomersView
 * <p>路径: /api/v1/fulfillment/* 和 /api/v2/sales/quotes
 */
@RestController
public class SalesFulfillmentController {

    private final Map<String, Map<String, Object>> rmaStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> receiptStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> quoteStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> outreachStore = new ConcurrentHashMap<>();

    // ===== B-01: 查询 RMA 列表 =====
    @GetMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> listRmas(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(rmaStore.values());
        return result(items);
    }

    // ===== B-02: 创建 RMA =====
    @PostMapping("/api/v1/fulfillment/rmas")
    public Map<String, Object> createRma(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("rmaNo", "RMA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "REQUESTED");
        rmaStore.put(id, body);
        return body;
    }

    // ===== B-03: 审批 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) {
            rma.put("status", "APPROVED");
            if (body != null && body.containsKey("approvedQty"))
                rma.put("approvedQty", body.get("approvedQty"));
        }
        return rma;
    }

    // ===== B-04: RMA 检验 =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) {
            rma.put("status", "INSPECTION_COMPLETED");
            if (body != null) rma.putAll(body);
        }
        return rma;
    }

    // ===== B-05: 关闭 RMA =====
    @PatchMapping("/api/v1/fulfillment/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) rma.put("status", "CLOSED");
        return rma;
    }

    // ===== B-06: 查询客户签收列表 =====
    @GetMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> listReceipts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(receiptStore.values());
        return result(items);
    }

    // ===== B-07: 登记客户签收 =====
    @PostMapping("/api/v1/fulfillment/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("receiptNo", "CR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "PENDING");
        receiptStore.put(id, body);
        return body;
    }

    // ===== B-08: 查询报价列表 (v2) =====
    @GetMapping("/api/v2/sales/quotes")
    public Map<String, Object> listQuotes(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(quoteStore.values());
        return result(items);
    }

    // ===== B-09: 创建报价单 (v2) =====
    @PostMapping("/api/v2/sales/quotes")
    public Map<String, Object> createQuote(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("quoteNo", "QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "DRAFT");
        quoteStore.put(id, body);
        return body;
    }

    // ===== B-10: 查询客户列表（销售域） =====
    @GetMapping("/api/v1/fulfillment/customers")
    public Map<String, Object> listCustomers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        return result(new ArrayList<>());
    }

    // ===== 触达设置 =====
    @GetMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> getOutreachSettings(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        Map<String, Object> settings = outreachStore.get(tenantId);
        if (settings == null) {
            settings = new java.util.LinkedHashMap<>();
            settings.put("thresholdDays", 3);
            settings.put("reminderEnabled", true);
        }
        return settings;
    }

    @PutMapping("/api/v1/platform/outreach-settings")
    public Map<String, Object> updateOutreachSettings(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        outreachStore.put(tenantId, body);
        return body;
    }

    // ===== AI 洞察 =====
    @GetMapping("/api/v1/sales/ai-insights")
    public Map<String, Object> aiInsights(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("stalledOrders", List.of());
        result.put("deliveryRiskOrders", List.of());
        result.put("totalSalesAmount", "0");
        result.put("monthlyOrderCount", 0);
        result.put("stalledCount", 0);
        result.put("deliveryRiskCount", 0);
        result.put("riskyQuotes", List.of());
        result.put("generatedAt", Instant.now().toString());
        return result;
    }

    // ===== 工具方法 =====
    private Map<String, Object> result(List<Map<String, Object>> items) {
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        r.put("items", items);
        r.put("total", items.size());
        return r;
    }
}
