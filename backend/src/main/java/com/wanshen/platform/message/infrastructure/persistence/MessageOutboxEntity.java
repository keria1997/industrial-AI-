package com.wanshen.platform.message.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** JPA mapping for the message module transactional event. */
@Entity
@Table(name = "msg_outbox")
public class MessageOutboxEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "event_id", nullable = false)
    private String eventId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;

    @Column(name = "correlation_id", nullable = false)
    private String correlationId = "";

    @Column(name = "trace_id", nullable = false)
    private String traceId = "";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false)
    private Map<String, Object> payload;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", nullable = false)
    private String lastError = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected MessageOutboxEntity() {}

    public MessageOutboxEntity(
            UUID id, String tenantId, String eventId, String eventType,
            String aggregateType, String aggregateId, long aggregateVersion,
            String correlationId, String traceId, Map<String, Object> payload,
            String status, int attempts, String lastError, Instant createdAt
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.eventId = eventId;
        this.eventType = eventType;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.aggregateVersion = aggregateVersion;
        this.correlationId = correlationId;
        this.traceId = traceId;
        this.payload = payload == null ? Map.of() : payload;
        this.status = status;
        this.attempts = attempts;
        this.lastError = lastError;
        this.createdAt = createdAt;
    }

    public void publish() {
        status = "PUBLISHED";
    }

    public void fail(String error, int maximumAttempts) {
        attempts++;
        lastError = error == null ? "" : error;
        status = attempts >= maximumAttempts ? "DEAD_LETTER" : "PENDING";
    }

    public UUID id() { return id; }
    public String tenantId() { return tenantId; }
    public String eventId() { return eventId; }
    public String eventType() { return eventType; }
    public String aggregateType() { return aggregateType; }
    public String aggregateId() { return aggregateId; }
    public long aggregateVersion() { return aggregateVersion; }
    public String correlationId() { return correlationId; }
    public String traceId() { return traceId; }
    public Map<String, Object> payload() { return payload == null ? Map.of() : payload; }
    public String status() { return status; }
    public int attempts() { return attempts; }
    public String lastError() { return lastError; }
    public Instant createdAt() { return createdAt; }
}
