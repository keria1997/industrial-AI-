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
 * 应付账款实体
 *
 * <p>映射到 {@code fin_payable} 表（迁移 009 定义）。
 */
@Entity
@Table(name = "fin_payable")
@Getter
@Setter
@NoArgsConstructor
public class FinancePayable {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "doc_no", nullable = false, unique = true)
    private String docNo;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "supplier_id", nullable = false)
    private String supplierId;

    @Column(name = "supplier_name", nullable = false)
    private String supplierName;

    @Column(name = "business_type", nullable = false, length = 8)
    private String businessType;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "source_id", nullable = false)
    private String sourceId;

    @Column(name = "source_doc_no")
    private String sourceDocNo;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal totalAmount;

    @Column(name = "paid_amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal paidAmount;

    @Column(name = "outstanding_amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal outstandingAmount;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "issued_at")
    private OffsetDateTime issuedAt;

    @Column(name = "settled_at")
    private OffsetDateTime settledAt;

    @Column(name = "remark", nullable = false)
    private String remark;

    @Version
    @Column(name = "row_version", nullable = false)
    private Long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
        if (updatedAt == null) updatedAt = OffsetDateTime.now();
        if (id == null) id = UUID.randomUUID();
    }

    @PreUpdate
    void preUpdate() { updatedAt = OffsetDateTime.now(); }
}
