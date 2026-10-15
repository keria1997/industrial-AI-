package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * RMA 退货实体
 *
 * <p>PRD 7.3.9.2.6: RMA 独立退货闭环。
 * <p>状态机: REQUESTED → APPROVED → IN_TRANSIT → INSPECTING → INSPECTION_COMPLETED → RESTOCKED → CLOSED
 */
@Entity
@Table(name = "sales_rma")
@Getter
@Setter
@NoArgsConstructor
public class SalesRma {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "rma_no", nullable = false, unique = true)
    private String rmaNo;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "order_no", nullable = false)
    private String orderNo;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "requested_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal requestedQty;

    @Column(name = "approved_qty", precision = 18, scale = 6)
    private BigDecimal approvedQty;

    @Column(name = "received_qty", precision = 18, scale = 6)
    private BigDecimal receivedQty;

    @Column(name = "qualified_qty", precision = 18, scale = 6)
    private BigDecimal qualifiedQty;

    @Column(name = "scrap_qty", precision = 18, scale = 6)
    private BigDecimal scrapQty;

    /** REQUESTED/APPROVED/IN_TRANSIT/INSPECTING/INSPECTION_COMPLETED/RESTOCKED/CLOSED */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Column(name = "credit_ar_id")
    private UUID creditArId;

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
