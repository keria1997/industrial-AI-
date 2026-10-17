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

    public Map<String, Object> tenant(RequestContext context) {
        require(context, "platform.org.view");
        return store.get(context.tenantId(), "tenant", context.tenantId())
                .orElseThrow(() -> notFound("租户"));
    }

    public Map<String, Object> saveTenant(RequestContext context, Map<String, Object> input) {
        require(context, "platform.tenant.manage");
        return store.transaction(() -> {
            Map<String, Object> current = tenant(context);
            int expected = context.expectedVersion() == null
                    ? Integer.parseInt(String.valueOf(input.getOrDefault("version", current.get("version"))))
                    : context.expectedVersion();
            if (expected != ((Number) current.get("version")).intValue()) {
                throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT",
                        "租户信息已被更新", "刷新租户信息后重试");
            }
            Map<String, Object> value = new LinkedHashMap<>(current);
            for (String field : List.of("name", "edition", "status", "expireAt")) {
                if (input.containsKey(field)) value.put(field, input.get(field));
            }
            value.put("version", ((Number) current.get("version")).intValue() + 1);
            value.put("updatedAt", LocalDateTime.now().format(AUDIT_TIME));
            store.save("tenant", context.tenantId(), value);
            audit(context, "更新租户信息", target(value), value.get("updatedAt").toString());
            return value;
        });
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
                Optional<Map<String, Object>> employee = store.list(tenantId, "employee").stream().filter(item ->
                        employeeId.equals(item.get("id")) && "active".equals(item.get("status"))).findFirst();
                if (employee.isPresent()) {
                    roleIds.addAll(strings(accountDoc.get(), "directRoleIds"));
                    store.list(tenantId, "position").stream()
                            .filter(position -> text(employee.get(), "primaryPositionId").equals(position.get("id")) && enabled(position))
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
        List<Map<String, Object>> orgUnits = store.list(tenantId, "orgUnit");
        List<Map<String, Object>> factories = orgUnits.stream()
                .filter(item -> "factory".equals(item.get("type")) && enabled(item)).toList();
        List<Map<String, Object>> warehouses = store.list(tenantId, "resource").stream()
                .filter(item -> "warehouse".equals(item.get("type")) && enabled(item)).toList();
        List<String> authorized = new ArrayList<>();
        List<String> authorizedWarehouses = new ArrayList<>();
        boolean allResources = false;
        if (!roleIds.isEmpty()) {
            for (String roleId : roleIds) {
                Map<String, Object> role = roles.stream().filter(item -> roleId.equals(item.get("id"))).findFirst().orElseThrow();
                String scope = text(role, "dataScope");
                List<String> scopeValues = strings(role, "scopeValues");
                if ("tenant_all".equals(scope)) {
                    allResources = true;
                    factories.forEach(item -> authorized.add(item.get("id").toString()));
                    warehouses.forEach(item -> authorizedWarehouses.add(item.get("id").toString()));
                    continue;
                }
                if ("factory_set".equals(scope) || "warehouse_set".equals(scope) || "org_tree".equals(scope)) {
                    var factoryIds = new LinkedHashSet<>(scopeValues.stream().filter(value ->
                            factories.stream().anyMatch(item -> value.equals(item.get("id").toString()))).toList());
                    if ("warehouse_set".equals(scope)) {
                        List<String> directWarehouses = scopeValues.stream().filter(value ->
                                warehouses.stream().anyMatch(item -> value.equals(item.get("id").toString()))).toList();
                        authorizedWarehouses.addAll(directWarehouses);
                        warehouses.stream().filter(item -> directWarehouses.contains(item.get("id").toString()))
                                .forEach(item -> {
                                    String factoryOrgId = text(item, "factoryOrgId");
                                    if (factories.stream().anyMatch(factory -> factoryOrgId.equals(factory.get("id").toString())))
                                        factoryIds.add(factoryOrgId);
                                });
                    }
                    if ("org_tree".equals(scope)) {
                        var descendants = new LinkedHashSet<>(scopeValues);
                        boolean changed = true;
                        while (changed) {
                            changed = false;
                            for (Map<String, Object> item : orgUnits) {
                                String parent = text(item, "parentId");
                                if (!parent.isBlank() && descendants.contains(parent) && descendants.add(item.get("id").toString())) changed = true;
                            }
                        }
                        factories.stream().filter(item -> descendants.contains(item.get("id").toString()))
                                .forEach(item -> factoryIds.add(item.get("id").toString()));
                    }
                    authorized.addAll(factoryIds);
                    if ("factory_set".equals(scope) || "org_tree".equals(scope)) {
                        warehouses.stream().filter(item -> factoryIds.contains(text(item, "factoryOrgId")))
                                .forEach(item -> authorizedWarehouses.add(item.get("id").toString()));
                    }
                }
            }
        }
        List<String> factoryIdList = allResources
                ? factories.stream().map(item -> item.get("id").toString()).toList()
                : authorized.stream().distinct().toList();
        List<String> warehouseIdList = allResources
                ? warehouses.stream().map(item -> item.get("id").toString()).toList()
                : authorizedWarehouses.stream().distinct().toList();
        List<String> distinctAuthorized = authorized.stream().distinct().toList();
        Map<String, Object> result = base("loginName", account);
        result.put("activeRole", activeRole); result.put("enabled", !roleIds.isEmpty());
        result.put("roleIds", roleIds); result.put("roleCodes", activeRoles.stream().map(role -> role.get("code")).toList());
        result.put("permissionCodes", allowed); result.put("deniedPermissionCodes", denied);
        result.put("fieldModes", fieldModes); result.put("authorizedFactoryOrgIds", distinctAuthorized);
        result.put("resourceScopeAll", allResources);
        result.put("authorizedWarehouseIds", warehouseIdList);
        result.put("authorizedWarehouseCodes", warehouses.stream()
                .filter(item -> warehouseIdList.contains(item.get("id").toString()))
                .map(item -> item.get("code")).toList());
        result.put("authorizedFactoryCodes", orgUnits.stream()
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

    public List<Map<String, Object>> dictionaries(
            RequestContext context, String category, String status
    ) {
        require(context, "platform.org.view");
        return store.list(context.tenantId(), "dictionary").stream()
                .filter(item -> !hasText(category) || category.equals(text(item, "category")))
                .filter(item -> !hasText(status) || status.equals(text(item, "status")))
                .sorted(Comparator
                        .comparingInt((Map<String, Object> item) -> integer(item, "sortOrder"))
                        .thenComparing(item -> text(item, "code"))
                        .thenComparing(item -> text(item, "name")))
                .toList();
    }

    public Map<String, Object> saveDictionary(RequestContext context, Map<String, Object> input) {
        require(context, "platform.dictionary.manage");
        validateDictionary(input);
        return store.transaction(() -> {
            ensureDictionaryCodeAvailable(context.tenantId(), text(input, "id"), text(input, "category"),
                    text(input, "code"));
            return save(context, "dictionary", "platform.dictionary.manage", "字典",
                    text(input, "id").isBlank() ? "新增字典" : "修改字典", input);
        });
    }

    public List<Map<String, Object>> permissionCatalog(RequestContext context) {
        require(context, "platform.permission.read");
        List<Map<String, Object>> values = new ArrayList<>(store.list(context.tenantId(), "permission"));
        values.sort(Comparator.comparing(item -> text(item, "code")));
        return values;
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
        if (roleId == null || roleId.isBlank()) return allRoleGrants(context.tenantId());
        return roleGrants(context.tenantId(), roleId);
    }

    public List<Map<String, Object>> allRoleGrants(String tenantId) {
        List<Map<String, Object>> grants = new ArrayList<>();
        for (Map<String, Object> role : store.list(tenantId, "role")) {
            grants.addAll(roleGrants(tenantId, role.get("id").toString()));
        }
        return grants;
    }

    public List<Map<String, Object>> saveRoleGrants(RequestContext context, String roleId, List<Map<String, Object>> input) {
        require(context, "platform.role.grant");
        return store.transaction(() -> {
            Map<String, Object> role = store.list(context.tenantId(), "role").stream()
                    .filter(item -> roleId.equals(item.get("id"))).findFirst().orElseThrow(() -> notFound("角色"));
            requireVersion(context, ((Number) role.get("version")).intValue());
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
            var nextRole = new LinkedHashMap<>(role);
            nextRole.put("version", ((Number) role.get("version")).intValue() + 1);
            nextRole.put("updatedAt", timestamp);
            store.save("role", roleId, nextRole);
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

    public Map<String, Object> auditPage(
            RequestContext context, String module, String resultFilter, String operator,
            String startTime, String endTime, int page, int pageSize
    ) {
        List<Map<String, Object>> items = auditLogs(
                context, module, resultFilter, operator, startTime, endTime, page, pageSize);
        int total = auditLogs(context, module, resultFilter, operator,
                startTime, endTime, 1, Integer.MAX_VALUE).size();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("total", total);
        response.put("hasMore", (long) page * pageSize < total);
        response.put("page", page);
        response.put("pageSize", pageSize);
        return response;
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

    public Map<String, Object> syncAdapter(RequestContext context, String id) {
        require(context, "platform.adapter.manage");
        return store.transaction(() -> {
            Map<String, Object> value = store.get(context.tenantId(), "adapter", id)
                    .orElseThrow(() -> notFound("权限适配器"));
            requireVersion(context, ((Number) value.get("version")).intValue());
            String endpoint = text(value, "syncEndpoint");
            if (endpoint.isBlank()) {
                value.put("status", "NOT_CONFIGURED");
                value.put("lastSyncAt", LocalDateTime.now().format(AUDIT_TIME));
                value.put("errorMessage", "外部适配端点未配置，未发生外部同步");
                value.put("version", ((Number) value.get("version")).intValue() + 1);
                value.put("updatedAt", LocalDateTime.now().format(AUDIT_TIME));
                store.save("adapter", id, value);
                audit(context, "同步权限适配器失败", target(value), value.get("updatedAt").toString());
                return value;
            }
            value.put("status", "synced");
            value.put("lastSyncAt", LocalDateTime.now().format(AUDIT_TIME));
            value.put("errorMessage", "");
            value.put("version", ((Number) value.get("version")).intValue() + 1);
            value.put("updatedAt", LocalDateTime.now().format(AUDIT_TIME));
            store.save("adapter", id, value);
            audit(context, "同步权限适配器", target(value), value.get("updatedAt").toString());
            return value;
        });
    }

    public Map<String, Object> saveSecurityParameters(RequestContext context, Map<String, Object> input) {
        require(context, "platform.security.manage");
        return store.transaction(() -> {
            String timestamp = LocalDateTime.now().format(AUDIT_TIME);
            Map<String, String> codes = Map.of(
                    "loginMaxFailures", "security.login.maxFailures",
                    "sessionHours", "security.session.hours",
                    "passwordMinLength", "security.password.minLength",
                    "passwordRequireUppercase", "security.password.requireUppercase",
                    "passwordRequireLowercase", "security.password.requireLowercase",
                    "passwordRequireDigit", "security.password.requireDigit",
                    "passwordRequireSpecial", "security.password.requireSpecial"
            );
            codes.forEach((bodyField, code) -> {
                if (!input.containsKey(bodyField)) return;
                Map<String, Object> parameter = store.list(context.tenantId(), "parameter").stream()
                        .filter(item -> code.equals(item.get("code"))).findFirst()
                        .orElseGet(() -> {
                            Map<String, Object> value = new LinkedHashMap<>();
                            value.put("id", UUID.randomUUID().toString());
                            value.put("tenantId", context.tenantId());
                            value.put("category", "security");
                            value.put("code", code);
                            value.put("name", code);
                            value.put("valueType", bodyField.toLowerCase().contains("require") ? "boolean" : "integer");
                            value.put("effectiveMode", "immediate");
                            value.put("version", 0);
                            value.put("createdAt", timestamp);
                            return value;
                        });
                Map<String, Object> value = new LinkedHashMap<>(parameter);
                value.put("value", String.valueOf(input.get(bodyField)));
                value.put("version", ((Number) value.get("version")).intValue() + 1);
                value.put("updatedAt", timestamp);
                store.save("parameter", value.get("id").toString(), value);
            });
            audit(context, "更新安全参数", context.tenantId(), timestamp);
            return securityParameters(context);
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

    private void validateDictionary(Map<String, Object> input) {
        requireDictionaryText(input, "category", 100);
        requireDictionaryText(input, "code", 50);
        requireDictionaryText(input, "name", 100);
        if (!Set.of("enabled", "disabled").contains(text(input, "status"))) {
            throw invalidDictionary("字典状态只允许 enabled 或 disabled");
        }
        if (!text(input, "code").matches("[A-Za-z0-9_.-]+")) {
            throw invalidDictionary("字典编码只允许字母、数字、下划线、点和横线");
        }
        input.putIfAbsent("sortOrder", 0);
        try {
            int sortOrder = Integer.parseInt(String.valueOf(input.get("sortOrder")));
            if (sortOrder < 0 || sortOrder > 9999) throw new NumberFormatException();
            input.put("sortOrder", sortOrder);
        } catch (NumberFormatException exception) {
            throw invalidDictionary("sortOrder必须是0到9999的整数");
        }
    }

    private void ensureDictionaryCodeAvailable(
            String tenantId, String dictionaryId, String category, String code
    ) {
        boolean duplicate = store.list(tenantId, "dictionary").stream()
                .anyMatch(item -> !text(item, "id").equals(dictionaryId)
                        && category.equals(text(item, "category"))
                        && code.equals(text(item, "code")));
        if (duplicate) {
            throw new ApiException(409, "PLATFORM_409_DICTIONARY_DUPLICATE",
                    "同一字典分类下的编码已存在", "更换字典编码后重试");
        }
    }

    private void requireDictionaryText(Map<String, Object> input, String field, int maxLength) {
        String value = text(input, field);
        if (!hasText(value) || value.length() > maxLength) {
            throw invalidDictionary(field + "必填且不能超过" + maxLength + "个字符");
        }
    }

    private ApiException invalidDictionary(String message) {
        return new ApiException(400, "PLATFORM_400_INVALID_DICTIONARY", message,
                "检查字典字段后重试");
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private int integer(Map<String, Object> value, String field) {
        try {
            return Integer.parseInt(String.valueOf(value.getOrDefault(field, 0)));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

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
