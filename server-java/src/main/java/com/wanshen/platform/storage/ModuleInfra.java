package com.wanshen.platform.storage;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

public final class ModuleInfra {
    private ModuleInfra() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OutboxEvent(
            String eventId, String tenantId, String eventType, String aggregateType,
            String aggregateId, int aggregateVersion, String correlationId, String traceId,
            Map<String, Object> payload, String status, int attempts, String lastError,
            String createdAt
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AuditLog(
            String id, String tenantId, String aggregateType, String aggregateId,
            int aggregateVersion, String action, String actorId, Object before,
            Object after, String correlationId, String traceId, String occurredAt
    ) {}

    public record IdempotencyRecord(String requestHash, int statusCode, Object body) {}
}
