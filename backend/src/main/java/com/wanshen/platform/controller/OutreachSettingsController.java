package com.wanshen.platform.controller;

import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 销售触达设置 Controller
 *
 * <p>覆盖前端基础数据页签的触达规则配置。
 * <p>路径: /api/v1/platform/outreach-settings
 */
@RestController
@RequestMapping("/api/v1/platform/outreach-settings")
public class OutreachSettingsController {

    private final Map<String, Object> settings = new ConcurrentHashMap<>();

    @GetMapping
    public Map<String, Object> get(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        if (settings.isEmpty()) {
            settings.put("thresholdDays", 3);
            settings.put("reminderEnabled", true);
        }
        return settings;
    }

    @PutMapping
    public Map<String, Object> update(@RequestBody Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "TENANT-SHWS") String tenantId) {
        settings.putAll(body);
        return settings;
    }
}
