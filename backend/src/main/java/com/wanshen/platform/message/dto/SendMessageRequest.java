package com.wanshen.platform.message.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 发送消息请求
 */
public record SendMessageRequest(
        @NotBlank(message = "接收者不能为空") String recipientId,
        @NotBlank(message = "模板不能为空") String templateCode,
        String payload
) {}
