package com.wanshen.platform.fulfillment.dto;

import jakarta.validation.constraints.*;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;

/**
 * 出库过账请求
 */
public record OutboundPostRequest(
        @NotBlank(message = "幂等键不能为空") String idempotencyKey,
        @NotEmpty(message = "至少一行出库明细") @Valid List<OutboundLine> lines,
        String remark
) {
    public record OutboundLine(
            @NotBlank(message = "行ID不能为空") String lineId,
            @NotNull(message = "出库数量不能为空") @DecimalMin(value = "0.000001", message = "出库数量必须大于0") BigDecimal postedQty
    ) {}
}
