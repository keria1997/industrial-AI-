package com.wanshen.platform.fulfillment.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 创建销售订单请求
 */
public record CreateSalesOrderRequest(
        @NotBlank(message = "客户不能为空") String customerId,
        @NotBlank(message = "仓库名称不能为空") String warehouseId,
        @NotBlank(message = "工厂不能为空") String factoryId,
        @NotNull(message = "交期不能为空") LocalDate requestedDeliveryDate,
        boolean allowPartialShipment,
        @NotBlank(message = "收货人不能为空") String recipientName,
        @NotBlank(message = "收货电话不能为空") String recipientPhone,
        @NotBlank(message = "收货地址不能为空") String recipientAddress,
        String recipientCountry,
        String recipientProvince,
        String recipientCity,
        String recipientDistrict,
        String recipientPostalCode,
        String sourceQuoteId,
        @NotEmpty(message = "至少一行明细") @Valid List<OrderLineItem> lines,
        String remark
) {
    /**
     * 订单行明细
     */
    public record OrderLineItem(
            @NotBlank(message = "产品不能为空") String productId,
            @NotNull(message = "数量不能为空") @DecimalMin(value = "0.000001", message = "数量必须大于0") BigDecimal qty,
            @NotBlank(message = "单位不能为空") String uom,
            @NotNull(message = "单价不能为空") @DecimalMin(value = "0", message = "单价不能为负") BigDecimal unitPrice,
            @NotNull(message = "税率不能为空") @DecimalMin(value = "0") @DecimalMax(value = "100") BigDecimal taxRate,
            @NotNull(message = "承诺交期不能为空") LocalDate promisedDate,
            boolean allowPartialShipment
    ) {}
}
