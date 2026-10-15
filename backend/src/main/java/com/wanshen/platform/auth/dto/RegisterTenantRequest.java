package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.*;

/**
 * 租户注册请求（字段名与 AuthController.register 方法对齐）
 */
public record RegisterTenantRequest(
        @NotBlank(message = "租户名称不能为空") @Size(max = 200) String tenantName,
        @NotBlank(message = "所属行业不能为空") String industry,
        @NotBlank(message = "姓名不能为空") @Size(max = 100) String name,
        @NotBlank(message = "登录账号不能为空") @Size(min = 2, max = 50) String account,
        @NotBlank(message = "邮箱不能为空") @Email(message = "邮箱格式不正确") String email,
        @NotBlank(message = "手机号不能为空") @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @NotBlank(message = "密码不能为空") @Size(min = 8, message = "密码至少8位") String password
) {
}
