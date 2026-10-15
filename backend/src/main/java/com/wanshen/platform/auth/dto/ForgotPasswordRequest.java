package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 忘记密码请求（发送重置链接）
 */
public record ForgotPasswordRequest(
        @NotBlank(message = "邮箱不能为空") @Email(message = "邮箱格式不正确") String email
) {}
