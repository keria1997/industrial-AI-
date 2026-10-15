package com.wanshen.platform.fulfillment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 取消销售订单请求
 */
public record CancelOrderRequest(
        @NotBlank(message = "取消原因不能为空") @Size(max = 500, message = "取消原因不超过500字") String reason,
        @NotBlank(message = "版本号不能为空") String version
) {}
