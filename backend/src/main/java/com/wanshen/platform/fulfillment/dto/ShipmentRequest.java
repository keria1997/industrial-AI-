package com.wanshen.platform.fulfillment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 发货申请请求
 */
public record ShipmentRequest(
        @NotBlank(message = "仓库不能为空") String warehouseId,
        @NotBlank(message = "版本号不能为空") String version
) {}
