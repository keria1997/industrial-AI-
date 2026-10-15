package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 生产需求实体
 *
 * <p>映射到 {@code prod_demand} 表（迁移 001/029 定义）。
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

    @Column(name = "demand_no", nullable = false, unique = true)
    private String demandNo;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "source_id")
    private UUID sourceId;

    @Column(name = "source_line_id")
    private UUID sourceLineId;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal qty;

    @Column(name = "factory_resource_id", nullable = false)
    private String factoryResourceId;

    @Column(name = "warehouse_id", nullable = false)
    private String warehouseId;

    @Column(name = "uom", nullable = false, length = 32)
    private String uom;

    /** @see com.wanshen.platform.production.model.productionPlanStatus */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

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
