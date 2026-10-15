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
 * 销售订单行实体
 *
 * <p>映射到 {@code sales_order_line} 表（迁移 004 定义）。
 * <p>通过 {@code salesOrderId} 引用主表，不使用数据库外键。
 */
@Entity
@Table(name = "sales_order_line")
@Getter
@Setter
@NoArgsConstructor
public class SalesOrderLine {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "sales_order_id", nullable = false, updatable = false)
    private UUID salesOrderId;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "ordered_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal orderedQty;

    @Column(name = "shipped_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal shippedQty;

    @Column(name = "active_requested_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal activeRequestedQty;

    @Column(name = "reserved_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal reservedQty;

    @Column(name = "uom", nullable = false, length = 32)
    private String uom;

    @Column(name = "unit_price", nullable = false, precision = 20, scale = 6)
    private BigDecimal unitPrice;

    @Column(name = "tax_rate", nullable = false, precision = 9, scale = 6)
    private BigDecimal taxRate;

    @Column(name = "promised_date", nullable = false)
    private LocalDate promisedDate;

    @Column(name = "allow_partial_shipment", nullable = false)
    private Boolean allowPartialShipment;

    @Column(name = "line_status", nullable = false, length = 32)
    private String lineStatus;

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
    void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
