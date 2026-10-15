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
 * 收付款记录实体
 *
 * <p>映射到 {@code fin_payment} 表（迁移 009 定义）。
 * <p>方向: INBOUND=收款, OUTBOUND=付款。
 */
@Entity
@Table(name = "fin_payment")
@Getter
@Setter
@NoArgsConstructor
public class Payment {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "doc_no", nullable = false, unique = true)
    private String docNo;

    @Column(name = "direction", nullable = false, length = 8)
    private String direction;

    @Column(name = "receivable_id")
    private UUID receivableId;

    @Column(name = "payable_id")
    private UUID payableId;

    @Column(name = "counterparty_id", nullable = false)
    private String counterpartyId;

    @Column(name = "counterparty_name", nullable = false)
    private String counterpartyName;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal amount;

    @Column(name = "payment_method", nullable = false, length = 32)
    private String paymentMethod;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    @Column(name = "bank_account", nullable = false)
    private String bankAccount;

    @Column(name = "reference_no", nullable = false)
    private String referenceNo;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

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
