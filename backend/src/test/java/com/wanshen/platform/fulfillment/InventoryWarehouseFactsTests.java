package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.wanshen.platform.fulfillment.SalesShipmentWorkflowTests.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InventoryWarehouseFactsTests {
    static void warehouse(FulfillmentStore store, String tenant) {
        store.put(tenant, "server-wh-id", MAPPER.createObjectNode().put("tenantId", tenant)
                .put("id", "server-wh-id").put("code", "WH-TEST").put("status", "active"), store.warehouses);
    }

    static JsonNode shipLegacyFact(FulfillmentService service, String tenant) {
        JsonNode order = confirmed(service, tenant, true, "0.3");
        stock(service, tenant, "FG-0", "1.3", "0");
        warehouse(service.repository(), tenant);
        JsonNode task = request(service, tenant, order, null);
        JsonNode result = reserve(service, tenant, task);
        assertThat(result.path("task").path("warehouseId").asText()).isEqualTo("server-wh-id");
        JsonNode posted = post(service, tenant, result.path("outbound"), Map.of("FG-0", "0.3"));
        JsonNode byCode = service.availability(context(tenant, null, null), "WH-TEST", List.of("FG-0")).get(0);
        assertThat(service.availability(context(tenant, null, null), "server-wh-id", List.of("FG-0"))).containsExactly(byCode);
        assertThat(service.availability(context(tenant, null, null), null, null)).containsExactly(byCode);
        assertThat(byCode.path("warehouseId").asText()).isEqualTo("server-wh-id");
        assertThat(byCode.path("qualifiedOnHandQty").asText()).isEqualTo("1");
        assertThat(byCode.path("allocatedReservedQty").asText()).isEqualTo("0");
        assertThat(byCode.path("fulfillableQty").asText()).isEqualTo("1");
        assertThat(posted.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        return byCode;
    }

    @Test
    void warehouseCodeAndIdShareReservationAndDeductionOfLegacyFacts() {
        FulfillmentStore store = new FulfillmentStore();
        shipLegacyFact(service(store), TENANT);
        assertThat(store.availability).containsOnlyKeys(TENANT + ":server-wh-id:FG-0");
    }

    @Test
    void aliasesShareMonotonicVersionsAndTenantIsolation() {
        FulfillmentStore store = new FulfillmentStore();
        FulfillmentService service = service(store);
        JsonNode original = stock(service, TENANT, "FG-0", "5", "0");
        warehouse(store, TENANT);
        ObjectNode stale = original.deepCopy();
        stale.put("warehouseId", "server-wh-id").put("qualifiedOnHandQty", "99");
        assertThat(store.saveAvailability(stale)).isEqualTo("STALE");
        assertThat(service.availability(context(TENANT, null, null), null, null)).hasSize(1);
        assertThat(service.availability(context("other", null, null), null, null)).isEmpty();
        assertThat(store.availability(TENANT, "server-wh-id", "FG-0").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("5");
        assertThat(service.availability(context(TENANT, null, null), "unknown", null)).isEmpty();
    }

    @Test
    void ambiguousDuplicateFactsBlockReadsAndWritesWithoutSummingOrChoosingOne() {
        FulfillmentStore store = new FulfillmentStore();
        JsonNode original = stock(service(store), TENANT, "FG-0", "5", "0");
        warehouse(store, TENANT);
        ObjectNode duplicate = original.deepCopy();
        duplicate.put("warehouseId", "server-wh-id").put("factVersion", 2);
        store.availability.put(TENANT + ":server-wh-id:FG-0", duplicate);
        ApiException error = assertThrows(ApiException.class, () -> store.availability(TENANT, "WH-TEST", "FG-0"));
        assertThat(error.status()).isEqualTo(409);
        assertThrows(ApiException.class, () -> store.saveAvailability(duplicate));
        assertThat(store.availability).hasSize(2);
    }
}
