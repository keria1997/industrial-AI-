package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 账号密码登录请求
 */
public record LoginRequest(
        @NotBlank(message = "账号不能为空") String account,
        @NotBlank(message = "密码不能为空") @Size(min = 6, max = 128, message = "密码长度须在6~128位之间") String password,
        @NotBlank(message = "验证码ID不能为空") String captchaId,
        @NotBlank(message = "验证码不能为空") @Size(min = 4, max = 4, message = "验证码为4位字符") String captchaCode
) {}
