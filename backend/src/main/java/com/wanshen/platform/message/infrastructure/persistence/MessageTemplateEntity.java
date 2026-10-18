package com.wanshen.platform.message.infrastructure.persistence;

import com.wanshen.platform.message.AbstractMessageStore.TemplateVariable;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** JPA mapping for the existing message template physical table. */
@Entity
@Table(name = "msg_template")
public class MessageTemplateEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "api_id", updatable = false)
    private String businessId;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "channel", nullable = false)
    private String channel;

    @Column(name = "title_template", nullable = false)
    private String titleTemplate;

    @Column(name = "body_template", nullable = false)
    private String bodyTemplate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "variables", nullable = false)
    private List<TemplateVariable> variables = new ArrayList<>();

    @Column(name = "priority", nullable = false)
    private String priority;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "remark", nullable = false)
    private String remark = "";

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "created_by", nullable = false)
    private String createdBy = "";

    protected MessageTemplateEntity() {}

    public MessageTemplateEntity(
            UUID id, String businessId, String tenantId, String code, String name, String category,
            String channel, String titleTemplate, String bodyTemplate,
            List<TemplateVariable> variables, String priority, boolean active,
            String remark, Instant createdAt, Instant updatedAt, String createdBy
    ) {
        this.id = id;
        this.businessId = businessId;
        this.tenantId = tenantId;
        this.code = code;
        this.name = name;
        this.category = category;
        this.channel = channel;
        this.titleTemplate = titleTemplate;
        this.bodyTemplate = bodyTemplate;
        this.variables = List.copyOf(variables);
        this.priority = priority;
        this.active = active;
        this.remark = remark;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.createdBy = createdBy;
    }

    public void apply(
            String name, String category, String channel, String titleTemplate,
            String bodyTemplate, List<TemplateVariable> variables, String priority,
            boolean active, String remark, Instant changedAt
    ) {
        this.name = name;
        this.category = category;
        this.channel = channel;
        this.titleTemplate = titleTemplate;
        this.bodyTemplate = bodyTemplate;
        this.variables = List.copyOf(variables);
        this.priority = priority;
        this.active = active;
        this.remark = remark;
        this.updatedAt = changedAt;
    }

    public UUID id() { return id; }
    public String businessId() { return businessId; }
    public String tenantId() { return tenantId; }
    public String code() { return code; }
    public String name() { return name; }
    public String category() { return category; }
    public String channel() { return channel; }
    public String titleTemplate() { return titleTemplate; }
    public String bodyTemplate() { return bodyTemplate; }
    public List<TemplateVariable> variables() { return List.copyOf(variables); }
    public String priority() { return priority; }
    public boolean active() { return active; }
    public String remark() { return remark; }
    public long rowVersion() { return rowVersion; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
    public String createdBy() { return createdBy; }
}
