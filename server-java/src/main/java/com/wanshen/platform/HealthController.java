package com.wanshen.platform;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {
    @GetMapping("/healthz")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "runtime", "java", "at", Instant.now().toString());
    }
}
