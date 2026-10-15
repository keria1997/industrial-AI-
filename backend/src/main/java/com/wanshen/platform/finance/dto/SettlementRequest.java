package com.wanshen.platform.finance.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * AR/AP 结算请求（核销）
 */
public record SettlementRequest(
        @NotNull(message = "结算金额不能为空") @DecimalMin(value = "0.01", message = "结算金额必须大于0") BigDecimal amount,
        @NotBlank(message = "付款方式不能为空") String paymentMethod,
        String remark,
        @NotBlank(message = "版本号不能为空") String version
) {}
