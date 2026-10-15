package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 重置密码请求
 */
public record ResetPasswordRequest(
        @NotBlank(message = "重置令牌不能为空") String token,
        @NotBlank(message = "新密码不能为空") @Size(min = 8, max = 128, message = "密码至少8位") String newPassword
) {}
