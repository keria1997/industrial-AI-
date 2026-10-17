package com.wanshen.platform.web;

import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.platform.PlatformProvisioningStore;
import com.wanshen.platform.platform.PlatformService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.ArrayList;

@Service
public class RequestContextService {
    private final TokenService tokenService;
    private final PlatformProvisioningStore platformStore;

    public RequestContextService(TokenService tokenService) {
        this(tokenService, null);
    }

    @Autowired
    public RequestContextService(TokenService tokenService, PlatformProvisioningStore platformStore) {
        this.tokenService = tokenService;
        this.platformStore = platformStore;
    }

    public RequestContext from(HttpServletRequest request) {
        String token = Optional.ofNullable(request.getHeader("Authorization"))
                .filter(value -> value.matches("(?i)^Bearer\\s+.+$"))
                .map(value -> value.replaceFirst("(?i)^Bearer\\s+", ""))
                .orElseThrow(() -> new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "缺少有效登录会话", "使用登录接口取得访问令牌后重试"));
        TokenService.Claims claims;
        try {
            claims = tokenService.verify(token);
        } catch (TokenService.InvalidTokenException exception) {
            throw new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "登录会话无效或已过期", "请重新登录后再试");
        }
        String tenantId = request.getHeader("X-Tenant-Id");
        if (tenantId == null || tenantId.isBlank()) tenantId = claims.tenantIds().get(0);
        if (!claims.tenantIds().contains(tenantId)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "当前会话无权访问所选租户", "切换到已授权企业后重试");
        }
        if (platformStore != null && platformStore.isSessionRevoked(tenantId, claims)) {
            throw new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "会话已注销，请重新登录", "使用登录接口取得新的访问令牌");
        }
        List<String> permissions = claims.permissions() == null ? List.of() : claims.permissions();
        if (platformStore != null && platformStore.list(tenantId, "account").stream()
                .anyMatch(account -> claims.sub().equals(account.get("loginName"))
                        && !"enabled".equals(account.get("status")))) {
            throw new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "账号已停用", "联系租户管理员");
        }
        boolean managedAccount = platformStore != null && platformStore.list(tenantId, "account").stream()
                .anyMatch(account -> claims.sub().equals(account.get("loginName")));
        ResourceScope resourceScope = ResourceScope.unrestricted();
        if (managedAccount) {
            // Resolve the signed account's roles, never the role selected in the browser.
            var lookup = new RequestContext(tenantId, claims.sub(), List.of("*"), "permission-lookup", null, null);
            var access = new PlatformService(platformStore).actorPermissions(lookup, claims.sub(), null);
            @SuppressWarnings("unchecked")
            List<String> allowed = (List<String>) access.get("permissionCodes");
            @SuppressWarnings("unchecked")
            List<String> denied = (List<String>) access.get("deniedPermissionCodes");
            permissions = claims.permissions() != null && claims.permissions().contains("*")
                    ? List.of("*") : ProductionPlanningPermissions.expand(allowed, denied);
            @SuppressWarnings("unchecked")
            List<String> factoryIds = (List<String>) access.get("authorizedFactoryOrgIds");
            @SuppressWarnings("unchecked")
            List<String> factoryCodes = (List<String>) access.get("authorizedFactoryCodes");
            @SuppressWarnings("unchecked")
            List<String> warehouseIds = (List<String>) access.get("authorizedWarehouseIds");
            @SuppressWarnings("unchecked")
            List<String> warehouseCodes = (List<String>) access.get("authorizedWarehouseCodes");
            resourceScope = Boolean.TRUE.equals(access.get("resourceScopeAll"))
                    ? ResourceScope.allResources()
                    : ResourceScope.restricted(factoryIds, factoryCodes, warehouseIds, warehouseCodes);
        } else {
            permissions = ProductionPlanningPermissions.expand(permissions, List.of());
        }
        return new RequestContext(
                tenantId,
                claims.sub(),
                permissions,
                Optional.ofNullable(request.getHeader("X-Trace-Id")).orElse("trace-" + System.nanoTime()),
                Optional.ofNullable(request.getHeader("Idempotency-Key"))
                        .filter(value -> !value.isBlank())
                        .orElse(request.getHeader("X-Idempotency-Key")),
                parseIfMatch(request.getHeader("If-Match")),
                resourceScope
        );
    }

    private Integer parseIfMatch(String value) {
        if (value == null) return null;
        var matcher = java.util.regex.Pattern.compile("\"?(\\d+)\"?").matcher(value.trim());
        return matcher.matches() ? Integer.valueOf(matcher.group(1)) : null;
    }

    public record RequestContext(
            String tenantId,
            String actorId,
            List<String> permissions,
            String traceId,
            String idempotencyKey,
            Integer expectedVersion,
            ResourceScope resourceScope
    ) {
        public RequestContext(
                String tenantId, String actorId, List<String> permissions, String traceId,
                String idempotencyKey, Integer expectedVersion
        ) {
            this(tenantId, actorId, permissions, traceId, idempotencyKey, expectedVersion, ResourceScope.unrestricted());
        }

        public boolean has(String permission) {
            return permissions.contains("*") || permissions.contains(permission);
        }

        public boolean canAccessFactory(String identifier) { return resourceScope.canAccessFactory(identifier); }

        public boolean canAccessWarehouse(String identifier) { return resourceScope.canAccessWarehouse(identifier); }
    }

    public record ResourceScope(
            boolean all, java.util.Set<String> factoryIds, java.util.Set<String> warehouseIds
    ) {
        public static ResourceScope unrestricted() {
            return new ResourceScope(true, java.util.Set.of(), java.util.Set.of());
        }

        public static ResourceScope allResources() { return unrestricted(); }

        public static ResourceScope restricted(
                List<String> factoryIds, List<String> factoryCodes,
                List<String> warehouseIds, List<String> warehouseCodes
        ) {
            var factories = new java.util.HashSet<String>();
            if (factoryIds != null) factories.addAll(factoryIds);
            if (factoryCodes != null) factories.addAll(factoryCodes);
            var warehouses = new java.util.HashSet<String>();
            if (warehouseIds != null) warehouses.addAll(warehouseIds);
            if (warehouseCodes != null) warehouses.addAll(warehouseCodes);
            return new ResourceScope(false, java.util.Set.copyOf(factories), java.util.Set.copyOf(warehouses));
        }

        public boolean canAccessFactory(String identifier) {
            return all || identifier != null && factoryIds.contains(identifier);
        }

        public boolean canAccessWarehouse(String identifier) {
            return all || identifier != null && warehouseIds.contains(identifier);
        }
    }
}
