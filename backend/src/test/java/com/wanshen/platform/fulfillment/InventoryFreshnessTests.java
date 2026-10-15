package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import org.junit.jupiter.api.Test;

import static com.wanshen.platform.fulfillment.SalesShipmentWorkflowTests.*;
import static org.assertj.core.api.Assertions.*;

class InventoryFreshnessTests {
    @Test void missingProductBlocksTheWholeReservationWithoutWritingInventoryOrOutbound() {
        var store = new FulfillmentStore();
        var service = service(store);
        JsonNode order = confirmed(service, TENANT, true, "5", "3");
        JsonNode task = request(service, TENANT, order, null);
        JsonNode before = stock(service, TENANT, "FG-0", "10", "0");
        assertThatThrownBy(() -> reserve(service, TENANT, task)).isInstanceOf(ApiException.class)
                .hasMessageContaining("缺少");
        assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(before);
        assertThat(store.reservationsByTask(TENANT, task.path("id").asText())).isEmpty();
        assertThat(service.shipmentTask(context(TENANT, null, null), task.path("id").asText()).path("outboundId").asText()).isEmpty();
    }

    @Test void expiredInvalidAndFutureTimestampsBlockBeforeAnyWrite() {
        for (String asOf : java.util.List.of("2000-01-01T00:00:00Z", "invalid",
                java.time.Instant.now().plusSeconds(3600).toString(), "")) {
            var store = new FulfillmentStore();
            var service = service(store);
            JsonNode order = confirmed(service, TENANT, true, "5");
            JsonNode task = request(service, TENANT, order, null);
            ObjectNode fact = stock(service, TENANT, "FG-0", "10", "0").deepCopy();
            fact.put("asOf", asOf).put("factVersion", fact.path("factVersion").asInt() + 1);
            store.saveAvailability(fact);
            assertThatThrownBy(() -> reserve(service, TENANT, task)).isInstanceOf(ApiException.class)
                    .hasMessageContaining("时间");
            assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(fact);
            assertThat(store.reservationsByTask(TENANT, task.path("id").asText())).isEmpty();
        }
    }

    @Test void explicitFreshZeroInventoryIsARealShortage() {
        var service = service(new FulfillmentStore());
        JsonNode order = confirmed(service, TENANT, true, "5");
        JsonNode task = request(service, TENANT, order, null);
        stock(service, TENANT, "FG-0", "0", "0");
        assertThat(reserve(service, TENANT, task).path("outcome").asText()).isEqualTo("SHORTAGE");
    }
}
