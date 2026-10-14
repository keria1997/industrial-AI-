package com.wanshen.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.platform.InMemoryPlatformProvisioningStore;
import com.wanshen.platform.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

class RequestContextServiceTests {
    @Test
    void mpsMenuUsesSignedAccountPositionAndPublishedGrantsImmediately() throws Exception {
        var tokens = new TokenService("test-secret", new ObjectMapper());
        var store = new InMemoryPlatformProvisioningStore();
        var contexts = new RequestContextService(tokens, store);
        store.save("account", "A", Map.of("tenantId", "T", "id", "A", "loginName", "planner",
                "employeeId", "E", "status", "enabled", "directRoleIds", List.of()));
        store.save("employee", "E", Map.of("tenantId", "T", "id", "E", "status", "active", "primaryPositionId", "P"));
        store.save("position", "P", Map.of("tenantId", "T", "id", "P", "status", "enabled", "defaultRoleIds", List.of("R")));
        store.save("role", "R", Map.of("tenantId", "T", "id", "R", "code", "PLANNER", "status", "enabled"));
        store.save("permission", "MENU", Map.of("tenantId", "T", "id", "MENU", "code", ProductionPlanningPermissions.MENU));
        store.save("permission", "APPROVE", Map.of("tenantId", "T", "id", "APPROVE", "code", "production.demand.approve"));
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + tokens.issue("planner", "计划员", "老板",
                List.of("T"), List.of("production.demand.approve"), "v1").accessToken());
        request.addHeader("X-Tenant-Id", "T");
        request.addHeader("X-Active-Role", "超级管理员");
        assertFalse(contexts.from(request).has("production.demand.approve"));
        store.save("roleGrant", "R", Map.of("tenantId", "T", "id", "R", "grants",
                List.of(Map.of("permissionId", "MENU", "effect", "allow"))));
        assertTrue(contexts.from(request).has("production.demand.approve"));
        assertTrue(contexts.from(request).has("production.work-order.create"));
        assertFalse(contexts.from(request).has("production.work-order.close-approve"));
        var demandStore = new com.wanshen.platform.production.ProductionStore();
        var production = new com.wanshen.platform.production.ProductionService(demandStore, new ObjectMapper());
        var mapper = new ObjectMapper();
        production.saveBom(new RequestContextService.RequestContext("T", "admin", List.of("*"), "bom", "bom", null),
                mapper.readTree("""
                    {"productId":"FG1","routingSnapshotId":"ROUTE1",
                     "routingSnapshot":{"id":"ROUTE1","productId":"FG1","operations":[
                       {"sequence":10,"code":"OP1","name":"Assembly","workCenterResourceId":"WC1","standardMinutes":"1"}]},
                     "lines":[{"materialId":"RM1","qtyPer":"1","warehouseId":"RM-WH","uom":"PCS"}]}
                    """));
        request.addHeader("X-Idempotency-Key", "create");
        var demand = production.createDemand(contexts.from(request), mapper.readTree("""
                {"sourceType":"MANUAL","productId":"FG1","qty":"1","uom":"PCS","dueDate":"2026-11-30","factoryResourceId":"FAC1"}
                """)).body();
        request.removeHeader("X-Idempotency-Key");
        request.addHeader("X-Idempotency-Key", "validate");
        production.validateDemand(contexts.from(request), demand.path("id").asText(), mapper.createObjectNode());
        request.removeHeader("X-Idempotency-Key");
        request.addHeader("X-Idempotency-Key", "self-approval");
        assertTrue(production.approveDemand(contexts.from(request), demand.path("id").asText(),
                new ObjectMapper().createObjectNode()).body().path("approvedBy").asText().equals("planner"));
        store.save("roleGrant", "R", Map.of("tenantId", "T", "id", "R", "grants",
                List.of(Map.of("permissionId", "MENU", "effect", "allow"), Map.of("permissionId", "APPROVE", "effect", "deny"))));
        assertFalse(contexts.from(request).has("production.demand.approve"));
        store.save("roleGrant", "R", Map.of("tenantId", "T", "id", "R", "grants", List.of()));
        assertFalse(contexts.from(request).has("production.demand.create"));
        request.removeHeader("X-Tenant-Id");
        request.addHeader("X-Tenant-Id", "OTHER");
        assertThrows(ApiException.class, () -> contexts.from(request));
    }

    @Test
    void rejectsBusinessRequestsAfterSessionRevocation() {
        TokenService tokens = new TokenService("test-secret", new ObjectMapper());
        InMemoryPlatformProvisioningStore store = new InMemoryPlatformProvisioningStore();
        RequestContextService contexts = new RequestContextService(tokens, store);
        String token = tokens.issue("admin", "管理员", "超级管理员", List.of("TENANT-SHWS"), List.of("*"), "test").accessToken();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        request.addHeader("X-Tenant-Id", "TENANT-SHWS");
        assertDoesNotThrow(() -> contexts.from(request));

        store.revokeSession("TENANT-SHWS", "admin");
        assertThrows(ApiException.class, () -> contexts.from(request));
    }
}
