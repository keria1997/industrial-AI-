package com.wanshen.platform.platform;

import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;

public class PlatformService {
    private static final DateTimeFormatter AUDIT_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final PlatformProvisioningStore store;

    public PlatformService(PlatformProvisioningStore store) { this.store = store; }

    public Map<String, Object> snapshot(RequestContext context) {
        require(context, "platform.permission.preview");
        String tenantId = context.tenantId();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tenant", store.get(tenantId, "tenant", tenantId).orElseThrow(() -> notFound("租户")));
        String[] kinds = {"capability", "orgUnit", "resource", "position", "employee", "account",
                "role", "permission", "adapter", "approvalRule", "dictionary", "parameter", "auditLog"};
        String[] names = {"capabilities", "orgUnits", "resources", "positions", "employees", "accounts",
                "roles", "permissions", "adapters", "approvalRules", "dictionaries", "parameters", "auditLogs"};
        for (int index = 0; index < kinds.length; index++) {
            List<Map<String, Object>> values = store.list(tenantId, kinds[index]);
            if ("account".equals(kinds[index])) values.forEach(value -> value.remove("passwordHash"));
            result.put(names[index], values);
        }
        List<Map<String, Object>> grants = new ArrayList<>();
        for (Map<String, Object> role : store.list(tenantId, "role")) {
            grants.addAll(roleGrants(tenantId, role.get("id").toString()));
        }
        result.put("roleGrants", grants);
        return result;
    }

    public Map<String, Object> actorPermissions(RequestContext context, String loginName, String activeRole) {
        require(context, "platform.actor.view");
        String tenantId = context.tenantId();
        String account = loginName == null || loginName.isBlank() ? context.actorId() : loginName;
        List<Map<String, Object>> roles = store.list(tenantId, "role");
        String mappedRoleCode = workbenchRole(activeRole);
        final List<String> roleIds = new ArrayList<>();
        if (mappedRoleCode != null) {
            roles.stream().filter(role -> mappedRoleCode.equals(role.get("code")) && enabled(role))
                    .findFirst().ifPresent(role -> roleIds.add(role.get("id").toString()));
        } else {
            Optional<Map<String, Object>> accountDoc = accounts(tenantId).stream()
                    .filter(item -> account.equals(item.get("loginName"))).findFirst();
            if (accountDoc.isPresent() && "enabled".equals(accountDoc.get().get("status"))) {
                String employeeId = text(accountDoc.get(), "employeeId");
                boolean employeeActive = store.list(tenantId, "employee").stream().anyMatch(item ->
                        employeeId.equals(item.get("id")) && "active".equals(item.get("status")));
                if (employeeActive) {
                    roleIds.addAll(strings(accountDoc.get(), "directRoleIds"));
                    store.list(tenantId, "position").stream()
                            .filter(position -> employeeId.equals(position.get("id")) && enabled(position))
                            .findFirst().ifPresent(position -> roleIds.addAll(strings(position, "defaultRoleIds")));
                }
            }
        }
        roleIds.removeIf(id -> roles.stream().noneMatch(role ->
                id.equals(role.get("id")) && enabled(role)));
        List<Map<String, Object>> activeRoles = roles.stream().filter(role ->
                roleIds.contains(role.get("id")) && enabled(role)).toList();
        List<Map<String, Object>> grants = new ArrayList<>();
        roleIds.forEach(roleId -> grants.addAll(roleGrants(tenantId, roleId)));
        List<String> allowed = new ArrayList<>(); List<String> denied = new ArrayList<>();
        Map<String, String> fieldModes = new LinkedHashMap<>();
        for (Map<String, Object> permission : store.list(tenantId, "permission")) {
            String id = permission.get("id").toString();
            List<Map<String, Object>> matched = grants.stream().filter(grant -> id.equals(grant.get("permissionId"))).toList();
            Optional<Map<String, Object>> deny = matched.stream().filter(grant -> "deny".equals(grant.get("effect"))).findFirst();
            if (deny.isPresent()) {
                denied.add(text(permission, "code"));
                if (deny.get().get("fieldMode") != null) fieldModes.put(text(permission, "code"), deny.get().get("fieldMode").toString());
            } else {
                Optional<Map<String, Object>> allow = matched.stream().filter(grant -> "allow".equals(grant.get("effect"))).findFirst();
                if (allow.isPresent()) {
                    allowed.add(text(permission, "code"));
                    if (allow.get().get("fieldMode") != null) fieldModes.put(text(permission, "code"), allow.get().get("fieldMode").toString());
                }
            }
        }
        List<String> factories = store.list(tenantId, "orgUnit").stream()
                .filter(item -> "factory".equals(item.get("type")) && enabled(item)).map(item -> item.get("id").toString()).toList();
        List<String> authorized = new ArrayList<>();
        if (!roleIds.isEmpty()) {
            for (String roleId : roleIds) {
                Map<String, Object> role = roles.stream().filter(item -> roleId.equals(item.get("id"))).findFirst().orElseThrow();
                String scope = text(role, "dataScope");
                if ("tenant_all".equals(scope)) { authorized.addAll(factories); continue; }
                if ("factory_set".equals(scope) || "warehouse_set".equals(scope) || "org_tree".equals(scope)) {
                    authorized.addAll(strings(role, "scopeValues").stream().filter(factories::contains).toList());
                }
            }
        }
        List<String> distinctAuthorized = authorized.stream().distinct().toList();
        Map<String, Object> result = base("loginName", account);
        result.put("activeRole", activeRole); result.put("enabled", !roleIds.isEmpty());
        result.put("roleIds", roleIds); result.put("roleCodes", activeRoles.stream().map(role -> role.get("code")).toList());
        result.put("permissionCodes", allowed); result.put("deniedPermissionCodes", denied);
        result.put("fieldModes", fieldModes); result.put("authorizedFactoryOrgIds", distinctAuthorized);
        result.put("authorizedFactoryCodes", store.list(tenantId, "orgUnit").stream()
                .filter(item -> "factory".equals(item.get("type")) && enabled(item) && distinctAuthorized.contains(item.get("id")))
                .map(item -> item.get("code")).toList());
        result.put("dataScopes", activeRoles.stream().map(role -> Map.of("roleCode", role.get("code"),
                "dataScope", text(role, "dataScope"), "scopeValues", strings(role, "scopeValues"))).toList());
        return result;
    }

    public List<Map<String, Object>> list(RequestContext context, String kind, String permission, String label) {
        require(context, permission);
        return store.list(context.tenantId(), kind);
    }

    public Map<String, Object> save(
            RequestContext context, String kind, String permission, String label,
            String action, Map<String, Object> input
    ) {
        require(context, permission);
        return store.transaction(() -> {
            String id = text(input, "id");
            Optional<Map<String, Object>> existing = id.isBlank() ? Optional.<Map<String, Object>>empty()
                    : store.get(context.tenantId(), kind, id);
            int version = existing.map(value -> ((Number) value.get("version")).intValue() + 1).orElse(1);
            String timestamp = LocalDateTime.now().format(AUDIT_TIME);
            Map<String, Object> value = existing.map(LinkedHashMap::new).orElseGet(LinkedHashMap::new);
            if (existing.isEmpty()) {
                value.put("id", id.isBlank() ? UUID.randomUUID().toString() : id);
                value.put("tenantId", context.tenantId()); value.put("createdAt", timestamp);
            }
            value.putAll(input); value.put("id", value.get("id")); value.put("tenantId", context.tenantId());
            value.put("version", version); value.put("updatedAt", timestamp);
            String docId = value.get("id").toString();
            store.save(kind, docId, value);
            audit(context, action, target(value), timestamp);
            return value;
        });
    }

    public void delete(RequestContext context, String kind, String permission, String label, String id) {
        require(context, permission);
        store.transaction(() -> {
            Map<String, Object> value = store.get(context.tenantId(), kind, id).orElseThrow(() -> notFound(label));
            requireVersion(context, ((Number) value.get("version")).intValue());
            store.delete(context.tenantId(), kind, id);
            audit(context, "删除" + label, target(value), LocalDateTime.now().format(AUDIT_TIME));
            return null;
        });
    }

    public List<Map<String, Object>> roleGrants(RequestContext context, String roleId) {
        require(context, "platform.org.view");
        return roleGrants(context.tenantId(), roleId);
    }

    public List<Map<String, Object>> saveRoleGrants(RequestContext context, String roleId, List<Map<String, Object>> input) {
        require(context, "platform.role.grant");
        return store.transaction(() -> {
            Map<String, Object> role = store.list(context.tenantId(), "role").stream()
                    .filter(item -> roleId.equals(item.get("id"))).findFirst().orElseThrow(() -> notFound("角色"));
            List<Map<String, Object>> existing = roleGrants(context.tenantId(), roleId);
            String timestamp = LocalDateTime.now().format(AUDIT_TIME);
            List<Map<String, Object>> grants = input.stream().map(item -> {
                Map<String, Object> grant = new LinkedHashMap<>();
                grant.put("roleId", roleId); grant.put("tenantId", context.tenantId());
                grant.put("permissionId", item.get("permissionId")); grant.put("effect", item.get("effect"));
                if (item.get("fieldMode") != null) grant.put("fieldMode", item.get("fieldMode"));
                int version = existing.stream().filter(prev -> item.get("permissionId").equals(prev.get("permissionId")))
                        .findFirst().map(prev -> ((Number) prev.get("version")).intValue()).orElse(0) + 1;
                grant.put("version", version); grant.put("updatedAt", timestamp);
                return grant;
            }).toList();
            Map<String, Object> document = new LinkedHashMap<>();
            document.put("id", roleId); document.put("tenantId", context.tenantId()); document.put("grants", grants);
            store.save("roleGrant", roleId, document);
            audit(context, "修改角色授权", target(role), timestamp);
            return grants;
        });
    }

    public List<Map<String, Object>> auditLogs(
            RequestContext context, String module, String resultFilter, String operator,
            String startTime, String endTime, int page, int pageSize
    ) {
        require(context, "platform.audit.view");
        List<Map<String, Object>> values = store.list(context.tenantId(), "auditLog").stream()
                .filter(item -> module == null || module.isBlank() || module.equals(item.get("module")))
                .filter(item -> resultFilter == null || resultFilter.isBlank() || resultFilter.equals(item.get("result")))
                .filter(item -> operator == null || operator.isBlank() || text(item, "operator").contains(operator))
                .filter(item -> startTime == null || startTime.isBlank() || text(item, "time").compareTo(startTime) >= 0)
                .filter(item -> endTime == null || endTime.isBlank() || text(item, "time").compareTo(endTime) <= 0)
                .sorted(Comparator.comparing((Map<String, Object> item) -> text(item, "time")).reversed())
                .toList();
        int from = Math.min((page - 1) * pageSize, values.size());
        return values.subList(from, Math.min(from + pageSize, values.size()));
    }

    public Map<String, Object> saveCapability(RequestContext context, Map<String, Object> input) {
        require(context, "platform.capability.manage");
        return store.transaction(() -> {
            Map<String, Object> value = store.list(context.tenantId(), "capability").stream()
                    .filter(item -> input.get("code").equals(item.get("code"))).findFirst().orElseThrow(() -> notFound("能力"));
            value.put("enabled", input.get("enabled"));
            value.put("version", ((Number) value.get("version")).intValue() + 1);
            value.put("updatedAt", LocalDateTime.now().format(AUDIT_TIME));
            store.save("capability", value.get("id").toString(), value);
            audit(context, Boolean.TRUE.equals(input.get("enabled")) ? "启用能力" : "禁用能力", target(value), value.get("updatedAt").toString());
            return value;
        });
    }

    public Map<String, Object> revokeSession(RequestContext context, Map<String, Object> input) {
        require(context, "platform.session.revoke");
        String timestamp = java.time.Instant.now().toString();
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("tenantId", context.tenantId()); value.put("account", input.get("account"));
        value.put("jti", input.get("jti")); value.put("revokedAt", timestamp);
        value.put("revokedBy", context.actorId()); value.put("reason", input.get("reason"));
        store.save("sessionRevocation", input.get("account") + ":" + input.get("jti"), value);
        audit(context, "撤销会话", input.get("account") + " / " + input.get("jti"), timestamp);
        return value;
    }

    public Map<String, Object> securityParameters(RequestContext context) {
        require(context, "platform.security.view");
        Map<String, String> values = new HashMap<>();
        store.list(context.tenantId(), "parameter").forEach(item -> values.put(text(item, "code"), text(item, "value")));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("loginMaxFailures", number(values.get("security.login.maxFailures"), 5));
        result.put("sessionHours", number(values.get("security.session.hours"), 8));
        result.put("passwordMinLength", number(values.get("security.password.minLength"), 8));
        result.put("passwordRequireUppercase", "true".equals(values.get("security.password.requireUppercase")));
        result.put("passwordRequireLowercase", "true".equals(values.get("security.password.requireLowercase")));
        result.put("passwordRequireDigit", "true".equals(values.get("security.password.requireDigit")));
        result.put("passwordRequireSpecial", "true".equals(values.get("security.password.requireSpecial")));
        return result;
    }

    private List<Map<String, Object>> roleGrants(String tenantId, String roleId) {
        return store.get(tenantId, "roleGrant", roleId).map(value -> {
            Object grants = value.get("grants");
            return grants instanceof List<?> list ? list.stream().map(item -> asMap(item)).toList() : List.<Map<String, Object>>of();
        }).orElse(List.of());
    }

    private List<Map<String, Object>> accounts(String tenantId) { return store.list(tenantId, "account"); }

    private void audit(RequestContext context, String action, String target, String timestamp) {
        Map<String, Object> log = new LinkedHashMap<>();
        log.put("id", UUID.randomUUID().toString()); log.put("tenantId", context.tenantId());
        log.put("time", timestamp); log.put("operator", context.actorId());
        log.put("module", "平台管理"); log.put("action", action); log.put("target", target);
        log.put("result", "success"); log.put("traceId", context.traceId());
        store.addAuditLog(log);
    }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                "缺少操作权限：" + permission, "请联系平台管理员授予对应平台权限");
    }

    private void requireVersion(RequestContext context, int version) {
        Integer expected = context.expectedVersion();
        if (expected != null && expected != version) throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT",
                "数据已被其他用户更新", "请刷新数据后重新确认本次操作");
    }

    private ApiException notFound(String label) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", label + "不存在或不在当前数据范围内",
                "请刷新列表并确认租户与数据权限");
    }

    private String target(Map<String, Object> value) {
        if (value.containsKey("code") && value.containsKey("name")) return value.get("code") + " / " + value.get("name");
        if (value.containsKey("loginName")) return value.get("loginName").toString();
        if (value.containsKey("permissionCode")) return value.get("permissionCode").toString();
        if (value.containsKey("documentType")) return value.get("module") + " / " + value.get("documentType");
        return text(value, "id");
    }

    private String workbenchRole(String value) {
        return switch (value == null ? "" : value) {
            case "超级管理员", "系统管理员", "管理员" -> "TENANT_ADMIN";
            case "老板" -> "TENANT_ADMIN"; case "人事" -> "HR_SPECIALIST";
            case "计划员" -> "PRODUCTION_DIRECTOR";
            case "车间" -> "PRODUCTION_WORKSHOP"; case "仓管" -> "WAREHOUSE_ADMIN";
            case "采购" -> "PURCHASE_STAFF"; case "销售" -> "SALE_STAFF"; case "财务" -> "FINANCE_STAFF";
            default -> null;
        };
    }

    private boolean enabled(Map<String, Object> value) { return "enabled".equals(value.get("status")); }
    private List<String> strings(Map<String, Object> value, String field) {
        Object values = value.get(field);
        return values instanceof List<?> list ? list.stream().map(String::valueOf).toList() : List.of();
    }
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) { Map<String, Object> result = new LinkedHashMap<>(); map.forEach((key, item) -> result.put(String.valueOf(key), item)); return result; }
        throw new IllegalStateException("Invalid document value");
    }
    private Map<String, Object> base(String key, Object value) { Map<String, Object> result = new LinkedHashMap<>(); result.put(key, value); return result; }
    private String text(Map<String, Object> value, String field) { return value.get(field) == null ? "" : value.get(field).toString(); }
    private int number(String value, int fallback) { try { return value == null ? fallback : Integer.parseInt(value); } catch (NumberFormatException exception) { return fallback; } }
}
