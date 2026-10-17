package com.wanshen.platform.platform;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class TenantProvisioningService {
    private final PlatformProvisioningStore store;

    public TenantProvisioningService(PlatformProvisioningStore store) { this.store = store; }
    public PlatformProvisioningStore store() { return store; }

    public Result provisionBaseline(Input input) {
        return store.transaction(() -> {
            if (store.tenantExists(input.tenantId())) return new Result(false, input.tenantId());
            String timestamp = Instant.now().toString();
            String tenantId = input.tenantId();
            store.save("tenant", tenantId, TenantCatalog.tenant(tenantId, input.tenantName(), timestamp));
            for (Map<String, Object> item : TenantCatalog.capabilities(tenantId, timestamp)) {
                store.save("capability", item.get("id").toString(), item);
            }
            List<Map<String, Object>> permissions = TenantCatalog.permissions(tenantId, timestamp);
            for (Map<String, Object> item : permissions) store.save("permission", item.get("id").toString(), item);
            for (Map<String, Object> role : TenantCatalog.roles(tenantId, timestamp)) {
                store.save("role", role.get("id").toString(), role);
            }
            for (var group : TenantCatalog.roleGrantGroups(tenantId, permissions, timestamp)) {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("id", group.getKey()); value.put("tenantId", tenantId); value.put("grants", group.getValue());
                store.save("roleGrant", group.getKey(), value);
            }
            for (Map<String, Object> orgUnit : TenantCatalog.orgUnits(tenantId, input.tenantName(), timestamp)) {
                store.save("orgUnit", orgUnit.get("id").toString(), orgUnit);
            }
            Map<String, Object> employee = new LinkedHashMap<>();
            employee.put("id", TenantCatalog.ADMIN_EMPLOYEE_ID); employee.put("tenantId", tenantId);
            employee.put("employeeNo", "ADMIN-001"); employee.put("name", input.adminName());
            employee.put("primaryOrgId", TenantCatalog.ROOT_ORG_ID);
            employee.put("mobile", ""); employee.put("email", ""); employee.put("status", "active");
            employee.put("version", 1); employee.put("createdAt", timestamp); employee.put("updatedAt", timestamp);
            store.save("employee", TenantCatalog.ADMIN_EMPLOYEE_ID, employee);
            Map<String, Object> account = new LinkedHashMap<>();
            account.put("id", TenantCatalog.ADMIN_ACCOUNT_ID); account.put("tenantId", tenantId);
            account.put("loginName", input.adminAccount()); account.put("employeeId", TenantCatalog.ADMIN_EMPLOYEE_ID);
            account.put("authType", "password"); account.put("status", "enabled");
            account.put("roleId", TenantCatalog.ADMIN_ROLE_ID);
            account.put("lastLoginAt", ""); account.put("version", 1);
            account.put("createdAt", timestamp); account.put("updatedAt", timestamp);
            store.save("account", TenantCatalog.ADMIN_ACCOUNT_ID, account);
            for (Map<String, Object> dictionary : TenantCatalog.dictionaries(tenantId, timestamp)) {
                store.save("dictionary", dictionary.get("id").toString(), dictionary);
            }
            for (Map<String, Object> parameter : TenantCatalog.parameters(tenantId, timestamp)) {
                store.save("parameter", parameter.get("id").toString(), parameter);
            }
            return new Result(true, tenantId);
        });
    }

    public void revokeSession(String tenantId, String account) { store.revokeSession(tenantId, account); }

    public boolean isSessionRevoked(String tenantId, String account) { return store.isSessionRevoked(tenantId, account); }

    public record Input(String tenantId, String tenantName, String adminAccount, String adminName) {}
    public record Result(boolean created, String tenantId) {}
}
