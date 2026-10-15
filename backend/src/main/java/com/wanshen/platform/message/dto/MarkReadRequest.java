package com.wanshen.platform.message.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 标记消息已读请求
 */
public record MarkReadRequest(@NotEmpty(message = "消息ID列表不能为空") List<String> messageIds) {}
