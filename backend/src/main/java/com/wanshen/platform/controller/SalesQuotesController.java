package com.wanshen.platform.controller;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;

/**
 * 销售报价 Controller (v2)
 *
 * <p>覆盖前端产品报价页签和新建报价弹窗。
 * <p>路径: /api/v2/sales/quotes
 */
@RestController
@RequestMapping("/api/v2/sales/quotes")
public class SalesQuotesController {

    private final Map<String, Map<String, Object>> store = new ConcurrentHashMap<>();

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        List<Map<String, Object>> items = new ArrayList<>(store.values());
        return Map.of("items", items, "total", items.size(), "page", page, "pageSize", pageSize);
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        String id = UUID.randomUUID().toString();
        body.put("id", id);
        body.put("quoteNo", "QT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        body.put("status", "DRAFT");
        store.put(id, body);
        return body;
    }
}
