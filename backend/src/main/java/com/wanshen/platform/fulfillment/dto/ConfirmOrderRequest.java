package com.wanshen.platform.fulfillment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 确认销售订单请求（固化发货内容）
 */
public record ConfirmOrderRequest(
        @NotBlank(message = "版本号不能为空") String version,
        String remark
) {}
