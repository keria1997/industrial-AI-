package com.wanshen.platform.personnel.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 创建员工请求
 */
public record CreateEmployeeRequest(
        @NotBlank(message = "姓名不能为空") @Size(max = 64) String name,
        @NotBlank(message = "部门不能为空") String departmentId,
        @NotBlank(message = "岗位不能为空") String positionId,
        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @Size(max = 128) String email
) {}
