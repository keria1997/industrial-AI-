package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/platform")
@ConditionalOnProperty(value = "app.platform.native-enabled", havingValue = "true")
public class PlatformController {
    private final PlatformService service;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;

    public PlatformController(
            PlatformService service, RequestContextService contexts, ObjectMapper objectMapper
    ) {
        this.service = service; this.contexts = contexts; this.objectMapper = objectMapper;
    }

    @GetMapping("/snapshot")
    public Map<String, Object> snapshot(HttpServletRequest request) {
        return service.snapshot(context(request));
    }

    @GetMapping("/tenant")
    public Map<String, Object> tenant(HttpServletRequest request) {
        return service.tenant(context(request));
    }

    @PutMapping("/tenant")
    public Map<String, Object> updateTenant(@RequestBody JsonNode body, HttpServletRequest request) {
        return service.saveTenant(context(request), map(body));
    }

    @GetMapping("/actor-permissions")
    public Map<String, Object> actorPermissions(
            HttpServletRequest request,
            @RequestParam(required = false) String loginName,
            @RequestParam(required = false) String activeRole
    ) { return service.actorPermissions(context(request), loginName, activeRole); }

    @GetMapping("/org-units")
    public List<Map<String, Object>> orgUnits(HttpServletRequest request) { return read(request, "orgUnit", "platform.org.view"); }
    @PostMapping("/org-units")
    public ResponseEntity<Object> createOrgUnit(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "orgUnit", "platform.org.manage", "组织架构", "新增组织架构", body, 201);
    }
    @PutMapping("/org-units/{id}")
    public ResponseEntity<Object> updateOrgUnit(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "orgUnit", "platform.org.manage", "组织架构", "修改组织架构", withId(body, id), 200);
    }
    @DeleteMapping("/org-units/{id}")
    public ResponseEntity<Void> deleteOrgUnit(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "orgUnit", "platform.org.manage", "组织架构", id);
    }

    @GetMapping("/resources")
    public List<Map<String, Object>> resources(HttpServletRequest request) { return read(request, "resource", "platform.org.view"); }
    @GetMapping("/permissions")
    public List<Map<String, Object>> permissions(HttpServletRequest request) {
        return service.permissionCatalog(context(request));
    }
    @GetMapping("/permission-resources")
    public List<Map<String, Object>> permissionResources(HttpServletRequest request) { return resources(request); }
    @PostMapping("/resources")
    public ResponseEntity<Object> createResource(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "resource", "platform.resource.manage", "企业资源", "新增企业资源", body, 201);
    }
    @PutMapping("/resources/{id}")
    public ResponseEntity<Object> updateResource(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "resource", "platform.resource.manage", "企业资源", "修改企业资源", withId(body, id), 200);
    }
    @DeleteMapping("/resources/{id}")
    public ResponseEntity<Void> deleteResource(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "resource", "platform.resource.manage", "企业资源", id);
    }

    @GetMapping("/employees")
    public List<Map<String, Object>> employees(HttpServletRequest request) { return read(request, "employee", "platform.org.view"); }
    @PostMapping("/employees")
    public ResponseEntity<Object> createEmployee(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "employee", "platform.employee.manage", "员工", "新增员工", body, 201);
    }
    @PutMapping("/employees/{id}")
    public ResponseEntity<Object> updateEmployee(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "employee", "platform.employee.manage", "员工", "修改员工", withId(body, id), 200);
    }
    @DeleteMapping("/employees/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "employee", "platform.employee.manage", "员工", id);
    }

    @GetMapping("/accounts")
    public List<Map<String, Object>> accounts(HttpServletRequest request) {
        List<Map<String, Object>> values = read(request, "account", "platform.org.view");
        values.forEach(value -> value.remove("passwordHash"));
        return values;
    }
    @PostMapping("/accounts")
    public ResponseEntity<Object> createAccount(@RequestBody JsonNode body, HttpServletRequest request) {
        return writeAccount(request, map(body), 201);
    }
    @PutMapping("/accounts/{id}")
    public ResponseEntity<Object> updateAccount(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return writeAccount(request, withId(body, id), 200);
    }
    @DeleteMapping("/accounts/{id}")
    public ResponseEntity<Void> deleteAccount(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "account", "platform.account.manage", "账号", id);
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> roles(HttpServletRequest request) { return read(request, "role", "platform.org.view"); }
    @PostMapping("/roles")
    public ResponseEntity<Object> createRole(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "role", "platform.role.manage", "角色", "新增角色", body, 201);
    }
    @PutMapping("/roles/{id}")
    public ResponseEntity<Object> updateRole(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "role", "platform.role.manage", "角色", "修改角色", withId(body, id), 200);
    }
    @DeleteMapping("/roles/{id}")
    public ResponseEntity<Void> deleteRole(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "role", "platform.role.manage", "角色", id);
    }
    @GetMapping("/roles/{id}/grants")
    public List<Map<String, Object>> roleGrants(@PathVariable String id, HttpServletRequest request) {
        return service.roleGrants(context(request), id);
    }
    @GetMapping("/role-grants")
    public List<Map<String, Object>> roleGrantList(
            @RequestParam(required = false) String roleId, HttpServletRequest request
    ) {
        return service.roleGrants(context(request), roleId);
    }
    @PutMapping("/roles/{id}/grants")
    public ResponseEntity<Object> saveRoleGrants(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = context(request);
        validateGrants(body);
        List<Map<String, Object>> value = service.saveRoleGrants(context, id, list(body.get("grants")));
        return ResponseEntity.ok().header("X-Trace-Id", context.traceId()).body(value);
    }

    @GetMapping("/adapters")
    public List<Map<String, Object>> adapters(HttpServletRequest request) { return read(request, "adapter", "platform.org.view"); }
    // Platform client compatibility alias; adapter is the canonical aggregate.
    @GetMapping("/permission-adapters")
    public List<Map<String, Object>> permissionAdapters(HttpServletRequest request) { return adapters(request); }
    @PostMapping("/permission-adapters/{id}/sync")
    public Map<String, Object> syncPermissionAdapter(@PathVariable String id, HttpServletRequest request) {
        return service.syncAdapter(context(request), id);
    }
    @PostMapping("/adapters")
    public ResponseEntity<Object> createAdapter(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "adapter", "platform.adapter.manage", "权限适配器", "新增权限适配器", body, 201);
    }
    @PutMapping("/adapters/{id}")
    public ResponseEntity<Object> updateAdapter(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "adapter", "platform.adapter.manage", "权限适配器", "修改权限适配器", withId(body, id), 200);
    }
    @DeleteMapping("/adapters/{id}")
    public ResponseEntity<Void> deleteAdapter(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "adapter", "platform.adapter.manage", "权限适配器", id);
    }

    @GetMapping("/approval-rules")
    public List<Map<String, Object>> approvalRules(HttpServletRequest request) { return read(request, "approvalRule", "platform.org.view"); }
    @PostMapping("/approval-rules")
    public ResponseEntity<Object> createApprovalRule(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "approvalRule", "platform.approval.manage", "审批规则", "新增审批规则", body, 201);
    }
    @PutMapping("/approval-rules/{id}")
    public ResponseEntity<Object> updateApprovalRule(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "approvalRule", "platform.approval.manage", "审批规则", "修改审批规则", withId(body, id), 200);
    }
    @DeleteMapping("/approval-rules/{id}")
    public ResponseEntity<Void> deleteApprovalRule(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "approvalRule", "platform.approval.manage", "审批规则", id);
    }

    @GetMapping("/dictionaries")
    public List<Map<String, Object>> dictionaries(
            HttpServletRequest request,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status
    ) {
        return service.dictionaries(context(request), category, status);
    }
    @PostMapping("/dictionaries")
    public ResponseEntity<Object> createDictionary(@RequestBody JsonNode body, HttpServletRequest request) {
        return writeDictionary(request, map(body), 201);
    }
    @PutMapping("/dictionaries/{id}")
    public ResponseEntity<Object> updateDictionary(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return writeDictionary(request, withId(body, id), 200);
    }
    @DeleteMapping("/dictionaries/{id}")
    public ResponseEntity<Void> deleteDictionary(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "dictionary", "platform.dictionary.manage", "字典", id);
    }

    @GetMapping("/parameters")
    public List<Map<String, Object>> parameters(HttpServletRequest request) { return read(request, "parameter", "platform.security.view"); }
    @PostMapping("/parameters")
    public ResponseEntity<Object> createParameter(@RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "parameter", "platform.parameter.manage", "系统参数", "新增系统参数", body, 201);
    }
    @PutMapping("/parameters/{id}")
    public ResponseEntity<Object> updateParameter(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        return write(request, "parameter", "platform.parameter.manage", "系统参数", "修改系统参数", withId(body, id), 200);
    }
    @DeleteMapping("/parameters/{id}")
    public ResponseEntity<Void> deleteParameter(@PathVariable String id, HttpServletRequest request) {
        return delete(request, "parameter", "platform.parameter.manage", "系统参数", id);
    }
    @GetMapping("/parameters/security")
    public Map<String, Object> securityParameters(HttpServletRequest request) {
        return service.securityParameters(context(request));
    }
    @PutMapping("/parameters/security")
    public Map<String, Object> updateSecurityParameters(@RequestBody JsonNode body, HttpServletRequest request) {
        return service.saveSecurityParameters(context(request), map(body));
    }

    @GetMapping("/audit-logs")
    public List<Map<String, Object>> auditLogs(
            HttpServletRequest request,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer pageSize
    ) {
        validatePage(page, pageSize);
        return service.auditLogs(context(request), module, result, operator, startTime, endTime, page, pageSize);
    }
    @GetMapping("/audits")
    public Map<String, Object> audits(
            HttpServletRequest request,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer pageSize
    ) {
        validatePage(page, pageSize);
        return service.auditPage(context(request), module, result, operator,
                startTime, endTime, page, pageSize);
    }

    @GetMapping("/capabilities")
    public List<Map<String, Object>> capabilities(HttpServletRequest request) { return read(request, "capability", "platform.org.view"); }
    @PostMapping("/capabilities")
    public ResponseEntity<Object> saveCapability(@RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = context(request);
        if (!body.hasNonNull("code") || body.path("code").asText().isBlank() || !body.hasNonNull("enabled")) bad();
        Map<String, Object> value = service.saveCapability(context, map(body));
        return ResponseEntity.ok().header("X-Trace-Id", context.traceId()).body(value);
    }
    @PutMapping("/capabilities/{code}")
    public Map<String, Object> updateCapability(
            @PathVariable String code, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        Map<String, Object> input = map(body);
        input.put("code", code);
        if (!input.containsKey("enabled") || code.isBlank()) bad();
        return service.saveCapability(context(request), input);
    }

    @PostMapping("/session-revocation")
    public ResponseEntity<Object> revokeSession(@RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = context(request);
        for (String field : List.of("account", "jti", "reason")) {
            if (!body.hasNonNull(field) || body.path(field).asText().isBlank()) bad();
        }
        Map<String, Object> value = service.revokeSession(context, map(body));
        return ResponseEntity.status(201).header("X-Trace-Id", context.traceId()).body(value);
    }

    private List<Map<String, Object>> read(HttpServletRequest request, String kind, String permission) {
        return service.list(context(request), kind, permission, kind);
    }

    private ResponseEntity<Object> write(
            HttpServletRequest request, String kind, String permission, String label,
            String action, Map<String, Object> input, int status
    ) {
        RequestContext context = context(request);
        validate(kind, input);
        Map<String, Object> value = service.save(context, kind, permission, label, action, input);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(status)
                .header("X-Trace-Id", context.traceId())
                .eTag("\"" + value.get("version") + "\"");
        if ("account".equals(kind)) value.remove("passwordHash");
        return response.body(value);
    }

    private ResponseEntity<Object> write(
            HttpServletRequest request, String kind, String permission, String label,
            String action, JsonNode body, int status
    ) {
        return write(request, kind, permission, label, action, map(body), status);
    }

    private ResponseEntity<Object> writeDictionary(
            HttpServletRequest request, Map<String, Object> input, int status
    ) {
        RequestContext context = context(request);
        validate("dictionary", input);
        Map<String, Object> value = service.saveDictionary(context, input);
        return ResponseEntity.status(status)
                .header("X-Trace-Id", context.traceId())
                .eTag("\"" + value.get("version") + "\"")
                .body(value);
    }

    private ResponseEntity<Object> writeAccount(
            HttpServletRequest request, Map<String, Object> input, int status
    ) {
        RequestContext context = context(request);
        validate("account", input);
        Map<String, Object> value = service.saveAccount(context, input);
        value.remove("passwordHash");
        return ResponseEntity.status(status)
                .header("X-Trace-Id", context.traceId())
                .eTag("\"" + value.get("version") + "\"")
                .body(value);
    }

    private ResponseEntity<Void> delete(
            HttpServletRequest request, String kind, String permission, String label, String id
    ) {
        service.delete(context(request), kind, permission, label, id);
        return ResponseEntity.noContent().build();
    }

    private RequestContext context(HttpServletRequest request) { return contexts.from(request); }

    private Map<String, Object> withId(JsonNode body, String id) {
        Map<String, Object> value = map(body); value.put("id", id); return value;
    }

    private Map<String, Object> map(JsonNode value) {
        return objectMapper.convertValue(value, objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
    }

    private List<Map<String, Object>> list(JsonNode value) {
        return objectMapper.convertValue(value, objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class));
    }

    private void validate(String kind, Map<String, Object> input) {
        List<String> required = switch (kind) {
            case "orgUnit" -> List.of("code", "name", "type", "status");
            case "resource" -> List.of("code", "name", "type", "ownerOrgId", "specification", "status");
            case "employee" -> List.of("employeeNo", "name", "primaryOrgId", "mobile", "email", "status");
            case "account" -> List.of("loginName", "employeeId", "roleId", "authType", "status");
            case "role" -> List.of("code", "name", "description", "dataScope", "status");
            case "adapter" -> List.of("permissionCode", "permissionName", "module", "legacyRoleCode", "legacyScope", "status");
            case "approvalRule" -> List.of("module", "documentType", "resolver", "resolverValue", "fallback", "status");
            case "dictionary" -> List.of("category", "code", "name", "status");
            case "parameter" -> List.of("code", "name", "value", "valueType", "effectiveMode");
            default -> List.of();
        };
        required.forEach(field -> {
            if (input.get(field) == null || input.get(field).toString().isBlank()) bad();
        });
        Map<String, Set<String>> enumRules = switch (kind) {
            case "orgUnit" -> Map.of("type", Set.of("company", "department", "factory", "workshop"));
            case "resource" -> Map.of("type", Set.of("line", "warehouse", "work_center"));
            case "employee" -> Map.of("status", Set.of("active", "transferring", "leave", "resigned"));
            case "account" -> Map.of("status", Set.of("pending_activation", "enabled", "locked", "disabled"));
            case "adapter" -> Map.of("status", Set.of("draft", "pending_sync", "synced", "conflict", "failed", "disabled"));
            case "approvalRule" -> Map.of("resolver", Set.of("by_role", "by_org_manager"));
            case "parameter" -> Map.of("valueType", Set.of("integer", "boolean", "text"));
            default -> Map.of();
        };
        enumRules.forEach((field, allowed) -> {
            Object value = input.get(field);
            if (value != null && !allowed.contains(String.valueOf(value))) bad();
        });
        Set<String> statuses = Set.of("enabled", "disabled", "active", "transferring", "leave", "resigned",
                "pending_activation", "locked");
        if (input.containsKey("status") && !statuses.contains(input.get("status"))) bad();
        if ("role".equals(kind) && input.get("scopeValues") == null) input.put("scopeValues", List.of());
        if ("adapter".equals(kind) && input.get("errorMessage") == null) input.put("errorMessage", "");
    }

    private void validateGrants(JsonNode body) {
        if (!body.has("grants") || !body.get("grants").isArray()) bad();
        for (JsonNode grant : body.get("grants")) {
            if (!grant.hasNonNull("permissionId") || grant.path("permissionId").asText().isBlank()
                    || !Set.of("allow", "deny").contains(grant.path("effect").asText())) bad();
        }
    }

    private void validatePage(Integer page, Integer pageSize) {
        if (page == null || page < 1 || pageSize == null || pageSize < 1 || pageSize > 200) bad();
    }

    private void bad() {
        throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "请求字段不符合规则", "检查输入后重试");
    }
}
