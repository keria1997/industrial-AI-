package com.wanshen.platform.auth;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegisteredUser(
        String id, String account, String passwordHash, String name, String phone,
        String email, String tenantId, String tenantName, String industry, String role,
        boolean isTenantAdmin, boolean firstLogin, String department, String position,
        String employeeNo, String status, List<String> permissions, String createdAt, long sessionVersion
) {}
