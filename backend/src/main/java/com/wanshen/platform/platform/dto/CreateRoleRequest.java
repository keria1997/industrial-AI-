package com.wanshen.platform.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 创建角色请求
 */
public record CreateRoleRequest(
        @NotBlank(message = "角色名称不能为空") @Size(max = 64) String name,
        String description,
        List<String> resourceIds
) {}
