package com.wanshen.platform.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 应收账款实体
 *
 * <p>映射到 {@code fin_receivable} 表（迁移 009 定义）。
 */
@Entity
@Table(name = "fin_receivable")
@Getter
@Setter
@NoArgsConstructor
public class FinanceReceivable {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "source_id", nullable = false)
    private UUID sourceId;

    @Column(name = "source_line_id")
    private UUID sourceLineId;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "total_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal totalAmount;

    @Column(name = "received_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal receivedAmount;

    @Column(name = "outstanding_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal outstandingAmount;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

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
