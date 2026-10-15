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
 * 生产工单实体
 *
 * <p>映射到 {@code prod_work_order} 表（实际数据库结构）。
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

    @Column(name = "code", nullable = false, unique = true)
    private String code;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "product_name")
    private String productName;

    @Column(name = "factory_resource_id", nullable = false)
    private String factoryResourceId;

    @Column(name = "work_center_resource_id", nullable = false)
    private String workCenterResourceId;

    @Column(name = "planned_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal plannedQty;

    @Column(name = "input_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal inputQty;

    @Column(name = "reported_good_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal reportedGoodQty;

    @Column(name = "reported_defect_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal reportedDefectQty;

    @Column(name = "posted_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal postedQty;

    @Column(name = "uom", nullable = false, length = 32)
    private String uom;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

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
        if (inputQty == null) inputQty = BigDecimal.ZERO;
        if (reportedGoodQty == null) reportedGoodQty = BigDecimal.ZERO;
        if (reportedDefectQty == null) reportedDefectQty = BigDecimal.ZERO;
        if (postedQty == null) postedQty = BigDecimal.ZERO;
    }

    @PreUpdate
    void preUpdate() { updatedAt = OffsetDateTime.now(); }
}
