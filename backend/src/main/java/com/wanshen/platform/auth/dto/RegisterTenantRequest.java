package com.wanshen.platform.auth.dto;

import jakarta.validation.constraints.*;

/**
 * 租户注册请求
 */
public record RegisterTenantRequest(
        @NotBlank(message = "租户名称不能为空") @Size(max = 128) String tenantName,
        @NotBlank(message = "所属行业不能为空") String industry,
        @NotBlank(message = "管理员姓名不能为空") @Size(max = 64) String adminName,
        @NotBlank(message = "登录账号不能为空") @Size(min = 3, max = 64) String username,
        @NotBlank(message = "邮箱不能为空") @Email(message = "邮箱格式不正确") String email,
        @NotBlank(message = "手机号不能为空") @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @NotBlank(message = "密码不能为空") @Size(min = 8, message = "密码至少8位") String password,
        @NotBlank(message = "确认密码不能为空") String confirmPassword
) {
    public boolean passwordMismatch() {
        return !password.equals(confirmPassword);
    }
}
