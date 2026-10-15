package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 生产需求实体
 *
 * <p>映射到 {@code prod_demand} 表（实际数据库结构）。
 * <p>关联通过 sourceId 列引用，不使用数据库外键。
 */
@Entity
@Table(name = "prod_demand")
@Getter
@Setter
@NoArgsConstructor
public class ProductionDemand {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "code", nullable = false, unique = true)
    private String code;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "product_name")
    private String productName;

    @Column(name = "qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal qty;

    @Column(name = "uom", nullable = false, length = 32)
    private String uom;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "priority", nullable = false)
    private Integer priority;

    @Column(name = "factory_resource_id", nullable = false)
    private String factoryResourceId;

    /** RECEIVED / PLANNED / SCHEDULED / COMPLETED */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "revision", nullable = false)
    private Integer revision;

    @Column(name = "correlation_id", nullable = false)
    private String correlationId;

    @Column(name = "block_reasons", nullable = false, columnDefinition = "jsonb DEFAULT '[]'")
    private String blockReasons;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Version
    @Column(name = "row_version", nullable = false)
    private Long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
        if (updatedAt == null) updatedAt = OffsetDateTime.now();
        if (id == null) id = UUID.randomUUID();
        if (revision == null) revision = 1;
        if (priority == null) priority = 50;
        if (blockReasons == null) blockReasons = "[]";
    }

    @PreUpdate
    void preUpdate() { updatedAt = OffsetDateTime.now(); }
}
