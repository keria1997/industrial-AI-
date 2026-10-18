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
import java.util.UUID;

/** JPA mapping for a replayable message command. */
@Entity
@Table(name = "msg_idempotency_record")
public class MessageIdempotencyEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "command_type", nullable = false, updatable = false)
    private String commandType;

    @Column(name = "idempotency_key", nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false)
    private String requestHash;

    @Column(name = "response_status", nullable = false)
    private int responseStatus;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_body")
    private Object responseBody;

    @Column(name = "trace_id", nullable = false)
    private String traceId = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected MessageIdempotencyEntity() {}

    public MessageIdempotencyEntity(
            UUID id, String tenantId, String commandType, String idempotencyKey,
            String requestHash, int responseStatus, Object responseBody,
            String traceId, Instant createdAt
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.commandType = commandType;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.responseStatus = responseStatus;
        this.responseBody = responseBody;
        this.traceId = traceId;
        this.createdAt = createdAt;
    }

    public String requestHash() { return requestHash; }
    public int responseStatus() { return responseStatus; }
    public Object responseBody() { return responseBody; }
}
