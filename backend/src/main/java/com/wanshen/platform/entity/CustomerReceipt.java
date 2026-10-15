package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.math.BigDecimal;

/**
 * 客户签收实体
 *
 * <p>PRD 7.3.9.2.7: 客户签收是销售完成关闭的独立业务事实。
 * <p>映射到 {@code customer_receipt} 表（迁移 036 定义）。
 */
@Entity
@Table(name = "customer_receipt")
@Getter
@Setter
@NoArgsConstructor
public class CustomerReceipt {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "receipt_no", nullable = false, unique = true)
    private String receiptNo;

    /** PENDING / PARTIALLY_SIGNED / SIGNED / REJECTED / DISPUTED */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "signed_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal signedQty;

    @Column(name = "rejected_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal rejectedQty;

    @Column(name = "damaged_qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal damagedQty;

    @Column(name = "signed_by", nullable = false)
    private String signedBy;

    @Column(name = "signed_at")
    private OffsetDateTime signedAt;

    @Column(name = "source_outbound_version", nullable = false)
    private Long sourceOutboundVersion;

    @Column(name = "source_fact_version", nullable = false)
    private Long sourceFactVersion;

    @Column(name = "evidence_urls", columnDefinition = "jsonb DEFAULT '[]'")
    private String evidenceUrls;

    @Column(name = "remark", nullable = false)
    private String remark;

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
