package com.wanshen.platform.finance.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * AR/AP 结算请求（核销）
 *
 * <p>对应 POST /api/v1/finance/receivables/{id}/settlement 和
 * POST /api/v1/finance/payables/{id}/settlement
 */
public record SettlementRequest(
        @NotNull(message = "结算金额不能为空") @DecimalMin(value = "0.01", message = "结算金额必须大于0") BigDecimal amount,
        @NotBlank(message = "付款方式不能为空") String paymentMethod,
        String paymentDate,
        String referenceNo,
        String remark,
        @NotBlank(message = "版本号不能为空") String version
) {}
