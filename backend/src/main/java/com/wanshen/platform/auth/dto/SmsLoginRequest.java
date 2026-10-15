package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 手机号短信登录请求
 */
public record SmsLoginRequest(
        @NotBlank(message = "手机号不能为空") @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @NotBlank(message = "短信验证码不能为空") @Pattern(regexp = "^\\d{6}$", message = "短信验证码为6位数字") String smsCode
) {}
