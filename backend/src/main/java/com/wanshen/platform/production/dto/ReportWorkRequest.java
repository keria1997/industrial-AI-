package com.wanshen.platform.production.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * 报工请求
 */
public record ReportWorkRequest(
        @NotBlank(message = "工序不能为空") String operationId,
        @NotNull(message = "合格数量不能为空") @DecimalMin(value = "0") BigDecimal qualifiedQty,
        @NotNull(message = "不合格数量不能为空") @DecimalMin(value = "0") BigDecimal unqualifiedQty,
        String remark,
        @NotBlank(message = "幂等键不能为空") String idempotencyKey
) {}
