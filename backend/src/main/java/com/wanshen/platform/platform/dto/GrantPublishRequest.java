package com.wanshen.platform.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 发布角色授权请求
 */
public record GrantPublishRequest(
        @NotBlank(message = "角色ID不能为空") String roleId,
        @NotEmpty(message = "资源列表不能为空") List<String> resourceIds,
        String comment
) {}
