package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static com.wanshen.platform.fulfillment.SalesShipmentWorkflowTests.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InventoryUnitShipmentTests {
    static JsonNode legacyOrder(FulfillmentService service, String tenant, String unit) {
        JsonNode order = confirmed(service, tenant, true, "1");
        return service.repository().transaction(tenant, repository -> {
            ObjectNode legacy = order.deepCopy();
            ((ObjectNode) legacy.path("lines").get(0)).put("uom", unit);
            repository.saveOrder(legacy);
            return legacy;
        });
    }

    static JsonNode shipLegacyUnit(FulfillmentService service, String tenant, String unit) {
        JsonNode order = legacyOrder(service, tenant, unit);
        stock(service, tenant, "FG-0", "5", "0");
        InventoryWarehouseFactsTests.warehouse(service.repository(), tenant);
        JsonNode result = reserve(service, tenant, request(service, tenant, order, null));
        assertThat(result.path("outbound").path("lines").get(0).path("uom").asText()).isEqualTo(unit);
        JsonNode posted = post(service, tenant, result.path("outbound"), Map.of("FG-0", "1"));
        assertThat(post(service, tenant, result.path("outbound"), Map.of("FG-0", "1"))).isEqualTo(posted);
        assertThat(posted.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        assertThat(posted.path("order").path("lines").get(0).path("uom").asText()).isEqualTo(unit);
        assertThat(posted.path("order").path("lines").get(0).path("shippedQty").asText()).isEqualTo("1");
        JsonNode fact = service.availability(context(tenant, null, null), "WH-TEST", List.of("FG-0")).get(0);
        assertThat(fact.path("qualifiedOnHandQty").asText()).isEqualTo("4");
        assertThat(fact.path("fulfillableQty").asText()).isEqualTo("4");
        assertThat(fact.path("allocatedReservedQty").asText()).isEqualTo("0");
        assertThat(fact.path("uom").asText()).isEqualTo("PCS");
        assertThat(service.repository().transactions(tenant)).hasSize(1).allSatisfy(transaction ->
                assertThat(transaction.path("uom").asText()).isEqualTo("PCS"));
        return posted;
    }

    @ParameterizedTest
    @ValueSource(strings = {"台", "件", "个", "PCS"})
    void existingSingleItemOrdersReservePostAndReplayWithoutChangingQuantities(String unit) {
        shipLegacyUnit(service(new FulfillmentStore()), TENANT, unit);
    }

    @ParameterizedTest
    @ValueSource(strings = {"套", "BOX", "KG", "kg", "箱"})
    void rejectsUnitsRequiringConversionBeforeAnyReservation(String unit) {
        FulfillmentStore store = new FulfillmentStore();
        var service = service(store);
        JsonNode order = legacyOrder(service, TENANT, unit);
        JsonNode fact = stock(service, TENANT, "FG-0", "5", "0");
        JsonNode task = request(service, TENANT, order, null);
        ApiException error = assertThrows(ApiException.class, () -> reserve(service, TENANT, task));
        assertThat(error.status()).isEqualTo(422);
        assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(fact);
        assertThat(store.reservations).isEmpty();
        assertThat(store.outbounds).isEmpty();
        assertThat(store.transactions(TENANT)).isEmpty();
    }

    @Test
    void legacyChineseInventoryFactCanFulfillCanonicalOrder() {
        FulfillmentStore store = new FulfillmentStore();
        var service = service(store);
        JsonNode order = confirmed(service, TENANT, true, "1");
        ObjectNode legacyFact = stock(service, TENANT, "FG-0", "5", "0").deepCopy();
        legacyFact.put("uom", "台");
        store.availability.put(FulfillmentStore.key(TENANT, "WH-TEST", "FG-0"), legacyFact);
        JsonNode outbound = reserve(service, TENANT, request(service, TENANT, order, null)).path("outbound");
        post(service, TENANT, outbound, Map.of("FG-0", "1"));
        JsonNode fact = store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow();
        assertThat(fact.path("qualifiedOnHandQty").asText()).isEqualTo("4");
        assertThat(fact.path("uom").asText()).isEqualTo("PCS");
    }

    @Test
    void canonicalizesIncomingCountFactsAndRejectsUnconvertedChanges() {
        FulfillmentStore store = new FulfillmentStore();
        var service = service(store);
        JsonNode original = stock(service, TENANT, "FG-0", "5", "0");
        ObjectNode update = original.deepCopy();
        update.put("uom", "台").put("factVersion", 2);
        assertThat(store.saveAvailability(update)).isEqualTo("UPDATED");
        JsonNode canonical = store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow();
        assertThat(canonical.path("uom").asText()).isEqualTo("PCS");
        update.put("uom", "套").put("factVersion", 3);
        assertThrows(ApiException.class, () -> store.saveAvailability(update));
        assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(canonical);
    }

    @Test
    void completionInCountAliasAddsOnceThenLegacyOrderCanShip() {
        FulfillmentStore store = new FulfillmentStore();
        var service = service(store);
        JsonNode order = legacyOrder(service, TENANT, "台");
        stock(service, TENANT, "FG-0", "0", "0");
        ObjectNode completion = MAPPER.createObjectNode().put("eventId", "completion-alias")
                .put("warehouseId", "WH-TEST").put("productId", "FG-0").put("qty", "5").put("uom", "台")
                .put("completionId", "completion-1").put("externalTransactionId", "completion-tx")
                .put("occurredAt", "2026-10-13T10:00:00Z");
        completion.putArray("allocations");
        assertThat(service.receiveCompletion(context(TENANT, null, null), completion).availability()
                .path("uom").asText()).isEqualTo("PCS");
        assertThat(service.receiveCompletion(context(TENANT, null, null), completion).duplicate()).isTrue();
        JsonNode outbound = reserve(service, TENANT, request(service, TENANT, order, null)).path("outbound");
        post(service, TENANT, outbound, Map.of("FG-0", "1"));
        assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()
                .path("qualifiedOnHandQty").asText()).isEqualTo("4");
        assertThat(store.transactions(TENANT)).hasSize(2);
    }
}
