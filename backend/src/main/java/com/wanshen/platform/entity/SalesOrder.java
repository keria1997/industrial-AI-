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
 * 销售订单实体
 *
 * <p>映射到 PostgreSQL 表 {@code sales_order}（迁移 004 定义）。
 * <p>关联关系通过 {@code customerId}/{@code warehouseId} 等列引用，不使用数据库外键。
 * <p>乐观锁通过 {@code rowVersion} 列实现。
 */
@Entity
@Table(name = "sales_order")
@Getter
@Setter
@NoArgsConstructor
public class SalesOrder {

    @Id
    @Column(name = "id", updatable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "order_no", nullable = false, unique = true)
    private String orderNo;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "owner_employee_id", nullable = false)
    private String ownerEmployeeId;

    @Column(name = "fulfillment_warehouse_id", nullable = false)
    private String fulfillmentWarehouseId;

    @Column(name = "factory_resource_id", nullable = false)
    private String factoryResourceId;

    @Column(name = "requested_delivery_date", nullable = false)
    private LocalDate requestedDeliveryDate;

    @Column(name = "allow_partial_shipment", nullable = false)
    private Boolean allowPartialShipment;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "total_amount", nullable = false, precision = 20, scale = 6)
    private BigDecimal totalAmount;

    /** @see com.wanshen.platform.common.enums.SalesOrderStatus */
    @Column(name = "overall_status", nullable = false, length = 32)
    private String overallStatus;

    @Column(name = "review_status", nullable = false, length = 32)
    private String reviewStatus;

    @Column(name = "shipment_status", nullable = false, length = 32)
    private String shipmentStatus;

    @Column(name = "review_required", nullable = false)
    private Boolean reviewRequired;

    @Column(name = "review_policy_version", nullable = false)
    private String reviewPolicyVersion;

    @Column(name = "recipient_name", nullable = false)
    private String recipientName;

    @Column(name = "recipient_phone_ciphertext", nullable = false)
    private String recipientPhoneCiphertext;

    @Column(name = "recipient_phone_key_id", nullable = false)
    private String recipientPhoneKeyId;

    @Column(name = "recipient_phone_masked", nullable = false)
    private String recipientPhoneMasked;

    @Column(name = "recipient_country", nullable = false)
    private String recipientCountry;

    @Column(name = "recipient_province", nullable = false)
    private String recipientProvince;

    @Column(name = "recipient_city", nullable = false)
    private String recipientCity;

    @Column(name = "recipient_district")
    private String recipientDistrict;

    @Column(name = "recipient_address", nullable = false)
    private String recipientAddress;

    @Column(name = "recipient_postal_code")
    private String recipientPostalCode;

    @Column(name = "source_quote_id")
    private UUID sourceQuoteId;

    @Column(name = "source_quote_revision")
    private Integer sourceQuoteRevision;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "canceled_at")
    private OffsetDateTime canceledAt;

    @Column(name = "correlation_id", nullable = false)
    private UUID correlationId;

    @Column(name = "created_by", nullable = false, updatable = false)
    private String createdBy;

    @Version
    @Column(name = "row_version", nullable = false)
    private Long rowVersion;

    @Column(name = "aggregate_snapshot", nullable = false, columnDefinition = "jsonb")
    private String aggregateSnapshot;

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
