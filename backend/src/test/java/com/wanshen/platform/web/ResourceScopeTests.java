package com.wanshen.platform.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.platform.InMemoryPlatformProvisioningStore;
import com.wanshen.platform.platform.PlatformService;
import com.wanshen.platform.production.ProductionService;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import com.wanshen.platform.web.RequestContextService.ResourceScope;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResourceScopeTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void warehouseRolesDeriveBothFactoryAndWarehouseIdentifiers() {
        var store = new InMemoryPlatformProvisioningStore();
        seedActor(store, "WAREHOUSE_ADMIN", "warehouse_set", List.of("RES-WH-FG"));
        var access = new PlatformService(store).actorPermissions(context(), "planner", null);
        assertThat(access.get("resourceScopeAll")).isEqualTo(false);
        assertThat((List<String>) access.get("authorizedFactoryOrgIds")).containsExactly("ORG-FAC-01");
        assertThat((List<String>) access.get("authorizedFactoryCodes")).containsExactly("FAC-SH-01");
        assertThat((List<String>) access.get("authorizedWarehouseIds")).containsExactly("RES-WH-FG");
        assertThat((List<String>) access.get("authorizedWarehouseCodes")).containsExactly("WH-FG-01");
    }

    @Test
    void requestsResolveRoleScopeEvenWhenSignedTokenContainsWildcard() throws Exception {
        var store = new InMemoryPlatformProvisioningStore();
        seedActor(store, "WAREHOUSE_ADMIN", "warehouse_set", List.of("RES-WH-FG"));
        var tokens = new com.wanshen.platform.auth.TokenService("scope-test-secret", mapper);
        var service = new RequestContextService(tokens, store);
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + tokens.issue("planner", "计划员", "管理员",
                List.of("T"), List.of("*"), "v1").accessToken());
        request.addHeader("X-Tenant-Id", "T");
        var context = service.from(request);
        assertThat(context.permissions()).containsExactly("*");
        assertThat(context.canAccessFactory("ORG-FAC-01")).isTrue();
        assertThat(context.canAccessFactory("FAC-SH-01")).isTrue();
        assertThat(context.canAccessFactory("OTHER-FAC")).isFalse();
        assertThat(context.canAccessWarehouse("RES-WH-FG")).isTrue();
        assertThat(context.canAccessWarehouse("WH-FG-01")).isTrue();
        assertThat(context.canAccessWarehouse("OTHER-WH")).isFalse();
    }

    @Test
    void productionReadsWritesAndListsStayInsideFactoryScope() throws Exception {
        var production = new ProductionService(new ProductionStore(), mapper);
        var allowed = new RequestContext("T", "planner", List.of("production.demand.create", "production.demand.read"),
                "allowed", "create", null, ResourceScope.restricted(
                        List.of("ORG-FAC-01"), List.of("FAC-SH-01"), List.of("RES-WH-FG"), List.of("WH-FG-01")));
        var denied = new RequestContext("T", "planner", List.of("production.demand.create", "production.demand.read"),
                "denied", "other", null, ResourceScope.restricted(
                        List.of("ORG-FAC-02"), List.of("FAC-SZ-01"), List.of("RES-WH-OTHER"), List.of("WH-OTHER")));
        var demand = production.createDemand(allowed, mapper.readTree("""
                {"sourceType":"MANUAL","productId":"FG1","qty":"1","uom":"PCS","dueDate":"2026-12-01",
                 "factoryResourceId":"FAC-SH-01","inventoryWarehouseId":"WH-FG-01"}
                """)).body();
        assertThat(production.listDemands(allowed, null, null, null, 1, 20).get("total")).isEqualTo(1);
        assertThat(production.listDemands(denied, null, null, null, 1, 20).get("total")).isEqualTo(0);
        assertThatThrownBy(() -> production.workOrder(denied, "missing")).isInstanceOf(
                com.wanshen.platform.web.ApiException.class);
        assertThatThrownBy(() -> production.createDemand(denied, mapper.readTree("""
                {"sourceType":"MANUAL","productId":"FG1","qty":"1","uom":"PCS","dueDate":"2026-12-01",
                 "factoryResourceId":"FAC-SH-01","inventoryWarehouseId":"WH-FG-01"}
                """))).isInstanceOf(com.wanshen.platform.web.ApiException.class);
    }

    @Test
    void fulfillmentOrdersRejectAndFilterOutsideWarehouseScope() throws Exception {
        var fulfillment = new com.wanshen.platform.fulfillment.FulfillmentService(
                new com.wanshen.platform.fulfillment.FulfillmentStore(), mapper, "FULFILLMENT_KEY_V1",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        var allowed = new RequestContext("T", "planner", List.of("*"), "allowed", "order", null,
                ResourceScope.restricted(
                        List.of("ORG-FAC-01"), List.of("FAC-SH-01"), List.of("RES-WH-FG"), List.of("WH-FG-01")));
        var denied = new RequestContext("T", "planner", List.of("*"), "denied", "other-order", null,
                ResourceScope.restricted(
                        List.of("ORG-FAC-02"), List.of("FAC-SZ-01"), List.of("RES-WH-OTHER"), List.of("WH-OTHER")));
        var input = mapper.readTree("""
                {"customerId":"C1","customerName":"Customer","fulfillmentWarehouseId":"WH-FG-01",
                 "factoryResourceId":"FAC-SH-01","ownerEmployeeId":"planner",
                 "requestedDeliveryDate":"2026-12-01","allowPartialShipment":true,
                 "currency":"CNY","recipient":{"name":"Receiver","phone":"13800138000",
                   "country":"China","province":"Shanghai","city":"Shanghai","address":"Test"},
                 "lines":[{"lineNo":1,"productId":"FG1","orderedQty":"1","uom":"PCS","unitPrice":"1",
                           "taxRate":"0","promisedDate":"2026-12-01","allowPartialShipment":true}]}
                """);
        var created = fulfillment.createOrder(allowed, input);
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(fulfillment.listOrders(allowed, null, null, null, null, 1, 20).get("total")).isEqualTo(1);
        assertThat(fulfillment.listOrders(denied, null, null, null, null, 1, 20).get("total")).isEqualTo(0);
        assertThatThrownBy(() -> fulfillment.createOrder(denied, input)).isInstanceOf(
                com.wanshen.platform.web.ApiException.class);
    }

    private RequestContext context() {
        return new RequestContext("T", "system", List.of("*"), "scope-test", null, null);
    }

    private void seedActor(
            InMemoryPlatformProvisioningStore store, String roleCode, String dataScope, List<String> scopeValues
    ) {
        store.save("account", "A", Map.of("tenantId", "T", "id", "A", "loginName", "planner",
                "employeeId", "E", "status", "enabled", "directRoleIds", List.of("R")));
        store.save("employee", "E", Map.of("tenantId", "T", "id", "E", "status", "active", "primaryPositionId", "P"));
        store.save("position", "P", Map.of("tenantId", "T", "id", "P", "status", "enabled",
                "defaultRoleIds", List.of()));
        store.save("role", "R", Map.of("tenantId", "T", "id", "R", "code", roleCode, "status", "enabled",
                "dataScope", dataScope, "scopeValues", scopeValues));
        store.save("orgUnit", "ORG-FAC-01", Map.of("tenantId", "T", "id", "ORG-FAC-01", "code", "FAC-SH-01",
                "type", "factory", "status", "enabled"));
        store.save("resource", "RES-WH-FG", Map.of("tenantId", "T", "id", "RES-WH-FG", "code", "WH-FG-01",
                "type", "warehouse", "factoryOrgId", "ORG-FAC-01", "status", "enabled"));
        store.save("permission", "MENU", Map.of("tenantId", "T", "id", "MENU", "code", "production.mps.view"));
        store.save("roleGrant", "R", Map.of("tenantId", "T", "id", "R", "grants",
                List.of(Map.of("permissionId", "MENU", "effect", "allow"))));
    }
}
