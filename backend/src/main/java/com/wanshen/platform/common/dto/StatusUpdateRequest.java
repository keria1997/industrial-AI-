package com.wanshen.platform.common.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 状态变更请求（审批通过/拒绝/取消等）
 */
public record StatusUpdateRequest(
        @NotBlank(message = "状态不能为空") String status,
        String comment,
        String version
) {}
