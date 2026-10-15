package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import com.wanshen.platform.web.RequestContextService.ResourceScope;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InventoryAiImportTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final FulfillmentStore store = new FulfillmentStore();
    private final FulfillmentService service = new FulfillmentService(
            store, mapper, "FULFILLMENT_KEY_V1", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");

    @Test
    void importsCustomerWmsSnapshotWithImportPermissionAndPreservesSource() throws Exception {
        var context = new RequestContext("T", "warehouse", List.of("inventory.availability.import"),
                "trace", "import", null, ResourceScope.restricted(
                        List.of("ORG-FAC-01"), List.of("FAC-SH-01"), List.of("WH-FG-01"), List.of("WH-FG-01")));
        var result = service.receiveAvailability(context, mapper.readTree("""
                {"eventId":"5d3f04de-2a90-4d47-a2b5-1b1c48e62658","warehouseId":"WH-FG-01",
                 "productId":"FG1","qualifiedOnHandQty":"10","allocatedReservedQty":"2",
                 "frozenQty":"1","safetyStockQty":"1","inTransitQty":"0","fulfillableQty":"6",
                 "uom":"PCS","formulaVersion":"FULFILLABLE-V1","factVersion":7,
                 "sourceSystem":"CUSTOMER_WMS","asOf":"%s"}
                """.formatted(Instant.now().toString())));
        assertThat(result.get("duplicate")).isEqualTo(false);
        assertThat(result.get("projectionResult")).isEqualTo("INSERTED");
        assertThat(store.availability("T", "WH-FG-01", "FG1")).isPresent();
        assertThat(store.availability("T", "WH-FG-01", "FG1").orElseThrow().path("sourceSystem").asText())
                .isEqualTo("CUSTOMER_WMS");
    }

    @Test
    void rejectsImportWithoutDedicatedPermissionOrCustomerWmsSource() throws Exception {
        var noPermission = new RequestContext("T", "sales", List.of("sales.order.read"), "trace", null, null);
        assertThatThrownBy(() -> service.receiveAvailability(noPermission, mapper.createObjectNode()))
                .isInstanceOf(ApiException.class);
        var importer = new RequestContext("T", "warehouse", List.of("inventory.availability.import"),
                "trace", null, null, ResourceScope.unrestricted());
        assertThatThrownBy(() -> service.receiveAvailability(importer, mapper.readTree("""
                {"sourceSystem":"REFERENCE_WMS","warehouseId":"WH","productId":"FG","asOf":"2026-10-15T00:00:00Z"}
                """))).isInstanceOf(ApiException.class);
    }
}
