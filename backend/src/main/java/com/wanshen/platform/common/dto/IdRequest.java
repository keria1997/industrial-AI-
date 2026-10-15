package com.wanshen.platform.common.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 单据ID请求（用于按ID查询或操作）
 */
public record IdRequest(@NotBlank(message = "ID不能为空") String id) {}
