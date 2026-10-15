package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 生产工单实体
 *
 * <p>映射到 {@code prod_work_order} 表（迁移 001/029 定义）。
 */
@Entity
@Table(name = "prod_work_order")
@Getter
@Setter
@NoArgsConstructor
public class WorkOrder {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "order_no", nullable = false, unique = true)
    private String orderNo;

    @Column(name = "demand_id")
    private UUID demandId;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "planned_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal plannedQty;

    @Column(name = "completed_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal completedQty;

    @Column(name = "factory_resource_id", nullable = false)
    private String factoryResourceId;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "bom_version")
    private String bomVersion;

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
    }

    @PreUpdate
    void preUpdate() { updatedAt = OffsetDateTime.now(); }
}
