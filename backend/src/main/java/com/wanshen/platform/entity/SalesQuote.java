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
 * 产品报价实体
 *
 * <p>映射到 {@code sales_quote} 表（迁移 035 定义）。
 */
@Entity
@Table(name = "sales_quote")
@Getter
@Setter
@NoArgsConstructor
public class SalesQuote {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "quote_no", nullable = false, unique = true)
    private String quoteNo;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "owner_employee_id", nullable = false)
    private String ownerEmployeeId;

    @Column(name = "quote_date", nullable = false)
    private LocalDate quoteDate;

    @Column(name = "valid_until", nullable = false)
    private LocalDate validUntil;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "total_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal totalAmount;

    /** @see com.wanshen.platform.common.enums.QuoteStatus */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "spec", nullable = false)
    private String spec;

    @Column(name = "unit", nullable = false, length = 32)
    private String unit;

    @Column(name = "qty", nullable = false, precision = 18, scale = 6)
    private BigDecimal qty;

    @Column(name = "unit_price", nullable = false, precision = 20, scale = 6)
    private BigDecimal unitPrice;

    @Column(name = "discount_rate", nullable = false, precision = 9, scale = 4)
    private BigDecimal discountRate;

    @Column(name = "discount_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal discountAmount;

    @Column(name = "remark", nullable = false)
    private String remark;

    @Column(name = "source_rma_id")
    private UUID sourceRmaId;

    @Column(name = "converted_order_id")
    private UUID convertedOrderId;

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
