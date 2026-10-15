package com.wanshen.platform.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * AI 查询请求
 */
public record AiQueryRequest(
        @NotBlank(message = "查询内容不能为空") @Size(max = 4000) String query,
        String context,
        String conversationId
) {}
