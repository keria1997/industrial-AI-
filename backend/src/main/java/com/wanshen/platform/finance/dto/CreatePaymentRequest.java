package com.wanshen.platform.finance.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * 登记收付款请求
 *
 * <p>对应 POST /api/v1/finance/payments
 */
public record CreatePaymentRequest(
        @NotBlank(message = "方向不能为空") @Pattern(regexp = "INBOUND|OUTBOUND", message = "方向为INBOUND或OUTBOUND") String direction,
        String receivableId,
        String payableId,
        @NotBlank(message = "交易对手ID不能为空") String counterpartyId,
        @NotBlank(message = "交易对手名称不能为空") String counterpartyName,
        String currency,
        @NotNull(message = "金额不能为空") @DecimalMin(value = "0.01", message = "金额必须大于0") BigDecimal amount,
        @NotBlank(message = "付款方式不能为空") String paymentMethod,
        String paymentDate,
        String bankAccount,
        String referenceNo,
        String remark,
        @NotBlank(message = "幂等键不能为空") String idempotencyKey
) {}
