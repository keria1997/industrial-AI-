package com.wanshen.platform.message.domain;

public record MessageOutboxEvent(
        String eventId,
        String tenantId,
        String eventType,
        String aggregateType,
        String aggregateId,
        int aggregateVersion,
        String correlationId,
        String traceId,
        MessageOutboxPayload payload,
        String status,
        int attempts,
        String lastError,
        String createdAt
) {}
