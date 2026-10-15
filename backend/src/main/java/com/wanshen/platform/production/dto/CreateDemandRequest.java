package com.wanshen.platform.production.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * 创建生产需求请求
 */
public record CreateDemandRequest(
        @NotBlank(message = "来源类型不能为空") String sourceType,
        @NotBlank(message = "来源单据不能为空") String sourceId,
        String sourceLineId,
        @NotBlank(message = "产品不能为空") String productId,
        @NotNull(message = "数量不能为空") @DecimalMin(value = "0.000001", message = "数量必须大于0") BigDecimal qty,
        @NotBlank(message = "工厂不能为空") String factoryId,
        @NotBlank(message = "仓库不能为空") String warehouseId,
        @NotBlank(message = "单位不能为空") String uom,
        String requestedDate,
        @NotBlank(message = "幂等键不能为空") String idempotencyKey
) {}
