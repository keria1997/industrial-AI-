package com.wanshen.platform.controller;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;

/**
 * 销售履约 Controller
 *
 * <p>覆盖前端 RmaManagementPanel / CustomerReceiptPanel / Sales_QuotesView / Sales_CustomersView
 * <p>路径: /api/v1/fulfillment/*
 */
@RestController
@RequestMapping("/api/v1/fulfillment")
public class SalesFulfillmentController {

    // 内存存储（后续替换为 JPA）
    private final Map<String, Map<String, Object>> rmaStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> receiptStore = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> quoteStore = new ConcurrentHashMap<>();

    // B-01: 查询 RMA 列表
    @GetMapping("/rmas")
    public Map<String, Object> listRmas(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(rmaStore.values());
        return Map.of("items", items, "total", items.size());
    }

    // B-02: 创建 RMA
    @PostMapping("/rmas")
    public Map<String, Object> createRma(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("rmaNo", "RMA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "REQUESTED");
        rmaStore.put(id, body);
        return body;
    }

    // B-03: 审批 RMA
    @PatchMapping("/rmas/{id}/approve")
    public Map<String, Object> approveRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) rma.put("status", "APPROVED");
        return rma;
    }

    // B-04: RMA 检验
    @PatchMapping("/rmas/{id}/inspect")
    public Map<String, Object> inspectRma(@PathVariable String id,
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) {
            rma.put("status", "INSPECTION_COMPLETED");
            if (body != null) rma.putAll(body);
        }
        return rma;
    }

    // B-05: 关闭 RMA
    @PatchMapping("/rmas/{id}/close")
    public Map<String, Object> closeRma(@PathVariable String id) {
        Map<String, Object> rma = rmaStore.get(id);
        if (rma != null) rma.put("status", "CLOSED");
        return rma;
    }

    // B-06: 查询客户签收列表
    @GetMapping("/customer-receipts")
    public Map<String, Object> listReceipts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(receiptStore.values());
        return Map.of("items", items, "total", items.size());
    }

    // B-07: 登记客户签收
    @PostMapping("/customer-receipts")
    public Map<String, Object> createReceipt(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("receiptNo", "CR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "PENDING");
        receiptStore.put(id, body);
        return body;
    }

    // B-08: 查询报价列表
    @GetMapping("/quotes")
    public Map<String, Object> listQuotes(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(quoteStore.values());
        return Map.of("items", items, "total", items.size());
    }

    // B-09: 创建报价单
    @PostMapping("/quotes")
    public Map<String, Object> createQuote(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("quoteNo", "QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "DRAFT");
        quoteStore.put(id, body);
        return body;
    }

    // B-10: 查询客户列表（销售域）
    @GetMapping("/customers")
    public Map<String, Object> listCustomers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        // 从 Store 读取客户（后续替换为 JPA 查询）
        return Map.of("items", List.of(), "total", 0);
    }
}
