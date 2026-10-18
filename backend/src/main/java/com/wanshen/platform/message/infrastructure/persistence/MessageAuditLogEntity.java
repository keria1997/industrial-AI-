package com.wanshen.platform.message.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import com.wanshen.platform.message.domain.MessageAuditState;

import java.time.Instant;
import java.util.UUID;

/** JPA mapping for a message-module audit fact. */
@Entity
@Table(name = "msg_audit_log")
public class MessageAuditLogEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;

    @Column(name = "action", nullable = false)
    private String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before")
    private MessageAuditState stateBefore;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after")
    private MessageAuditState stateAfter;

    @Column(name = "correlation_id", nullable = false)
    private String correlationId = "";

    @Column(name = "trace_id", nullable = false)
    private String traceId = "";

    @Column(name = "operator_id", nullable = false)
    private String operatorId = "";

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected MessageAuditLogEntity() {}

    public MessageAuditLogEntity(
            UUID id, String tenantId, String aggregateType, String aggregateId,
            long aggregateVersion, String action, MessageAuditState stateBefore, MessageAuditState stateAfter,
            String correlationId, String traceId, String operatorId, Instant occurredAt
    ) {
        this.id = id;
        this.tenantId = tenantId;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.aggregateVersion = aggregateVersion;
        this.action = action;
        this.stateBefore = stateBefore;
        this.stateAfter = stateAfter;
        this.correlationId = correlationId;
        this.traceId = traceId;
        this.operatorId = operatorId;
        this.occurredAt = occurredAt;
    }
}
