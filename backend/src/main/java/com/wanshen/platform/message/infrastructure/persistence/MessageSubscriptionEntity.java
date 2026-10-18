package com.wanshen.platform.message.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/** JPA mapping for a user's business-event subscription. */
@Entity
@Table(name = "msg_subscription")
public class MessageSubscriptionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "api_id", updatable = false)
    private String businessId;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MessageSubscriptionEntity() {}

    public MessageSubscriptionEntity(
            UUID id, String businessId, String tenantId, String userId, String eventType,
            String category, boolean enabled, Instant createdAt, Instant updatedAt
    ) {
        this.id = id;
        this.businessId = businessId;
        this.tenantId = tenantId;
        this.userId = userId;
        this.eventType = eventType;
        this.category = category;
        this.enabled = enabled;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID id() { return id; }
    public String businessId() { return businessId; }
    public String tenantId() { return tenantId; }
    public String userId() { return userId; }
    public String eventType() { return eventType; }
    public String category() { return category; }
    public boolean enabled() { return enabled; }
    public long rowVersion() { return rowVersion; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
}
