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
 * 采购订单实体
 *
 * <p>映射到 {@code proc_purchase_order} 表（迁移 007 定义）。
 */
@Entity
@Table(name = "proc_purchase_order")
@Getter
@Setter
@NoArgsConstructor
public class PurchaseOrder {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "order_no", nullable = false, unique = true)
    private String orderNo;

    @Column(name = "supplier_id", nullable = false)
    private String supplierId;

    @Column(name = "material_id", nullable = false)
    private String materialId;

    @Column(name = "warehouse_id", nullable = false)
    private String warehouseId;

    @Column(name = "ordered_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal orderedQty;

    @Column(name = "received_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal receivedQty;

    @Column(name = "uom", nullable = false, length = 32)
    private String uom;

    @Column(name = "unit_price", nullable = false, precision = 20, scale = 6)
    private BigDecimal unitPrice;

    @Column(name = "tax_rate", nullable = false, precision = 9, scale = 6)
    private BigDecimal taxRate;

    @Column(name = "total_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal totalAmount;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "required_date")
    private LocalDate requiredDate;

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
