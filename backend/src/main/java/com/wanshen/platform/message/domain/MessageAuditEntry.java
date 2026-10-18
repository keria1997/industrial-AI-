package com.wanshen.platform.message.domain;

public record MessageAuditEntry(
        String id,
        String tenantId,
        String aggregateType,
        String aggregateId,
        int aggregateVersion,
        String action,
        String actorId,
        MessageAuditState before,
        MessageAuditState after,
        String correlationId,
        String traceId,
        String occurredAt
) {}
