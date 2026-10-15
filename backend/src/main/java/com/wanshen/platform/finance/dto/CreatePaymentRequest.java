package com.wanshen.platform.finance.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * 登记收付款请求
 */
public record CreatePaymentRequest(
        @NotBlank(message = "方向不能为空") @Pattern(regexp = "IN|OUT", message = "方向为IN或OUT") String direction,
        String receivableId,
        String payableId,
        @NotNull(message = "金额不能为空") @DecimalMin(value = "0.01", message = "金额必须大于0") BigDecimal amount,
        @NotBlank(message = "付款方式不能为空") String paymentMethod,
        String remark,
        @NotBlank(message = "幂等键不能为空") String idempotencyKey
) {}
