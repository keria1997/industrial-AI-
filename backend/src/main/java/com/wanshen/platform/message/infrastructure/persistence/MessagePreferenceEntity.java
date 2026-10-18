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

/** JPA mapping for one user's notification preference in one category/channel pair. */
@Entity
@Table(name = "msg_user_preference")
public class MessagePreferenceEntity {
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

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "channel", nullable = false)
    private String channel;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "min_priority", nullable = false)
    private String minimumPriority;

    @Column(name = "quiet_hours_start", nullable = false)
    private String quietHoursStart = "";

    @Column(name = "quiet_hours_end", nullable = false)
    private String quietHoursEnd = "";

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MessagePreferenceEntity() {}

    public MessagePreferenceEntity(
            UUID id, String businessId, String tenantId, String userId, String category, String channel,
            boolean enabled, String minimumPriority, String quietHoursStart,
            String quietHoursEnd, Instant createdAt, Instant updatedAt
    ) {
        this.id = id;
        this.businessId = businessId;
        this.tenantId = tenantId;
        this.userId = userId;
        this.category = category;
        this.channel = channel;
        this.enabled = enabled;
        this.minimumPriority = minimumPriority;
        this.quietHoursStart = quietHoursStart;
        this.quietHoursEnd = quietHoursEnd;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public void apply(
            boolean enabled, String minimumPriority, String quietHoursStart,
            String quietHoursEnd, Instant changedAt
    ) {
        this.enabled = enabled;
        this.minimumPriority = minimumPriority;
        this.quietHoursStart = quietHoursStart;
        this.quietHoursEnd = quietHoursEnd;
        this.updatedAt = changedAt;
    }

    public UUID id() { return id; }
    public String businessId() { return businessId; }
    public String tenantId() { return tenantId; }
    public String userId() { return userId; }
    public String category() { return category; }
    public String channel() { return channel; }
    public boolean enabled() { return enabled; }
    public String minimumPriority() { return minimumPriority; }
    public String quietHoursStart() { return quietHoursStart; }
    public String quietHoursEnd() { return quietHoursEnd; }
    public long rowVersion() { return rowVersion; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
}
