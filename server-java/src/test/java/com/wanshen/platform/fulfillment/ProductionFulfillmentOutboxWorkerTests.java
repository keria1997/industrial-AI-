package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.production.ProductionFulfillmentOutboxWorker;
import com.wanshen.platform.production.ProductionStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class ProductionFulfillmentOutboxWorkerTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private ProductionStore productionStore;
    private FulfillmentStore fulfillmentStore;
    private ProductionFulfillmentOutboxWorker worker;

    @BeforeEach
    void setUp() {
        productionStore = new ProductionStore();
        fulfillmentStore = new FulfillmentStore();
        FulfillmentService fulfillment = new FulfillmentService(
                fulfillmentStore, mapper, "FULFILLMENT_KEY_V1",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY"
        );
        worker = new ProductionFulfillmentOutboxWorker(productionStore, fulfillment, "", true, 8);
    }

    @Test
    void relaysCompletionOnceAndRechecksReplenishmentTasks() {
        ObjectNode task = mapper.createObjectNode()
                .put("id", "task-1").put("tenantId", "T1")
                .put("salesOrderId", "SO-1").put("warehouseId", "WH-1")
                .put("replenishmentStatus", "IN_PROGRESS").put("version", 3);
        ObjectNode line = task.putArray("lines").addObject()
                .put("productId", "FG-1").put("productionDemandId", "D-1");
        line.put("version", 1);
        fulfillmentStore.shipmentTasks.put(FulfillmentStore.key("T1", "task-1"), task);
        ObjectNode event = completionEvent("E1");

        productionStore.addOutboxEvent(event);

        ProductionFulfillmentOutboxWorker.DrainResult result = worker.drain("T1");

        assertThat(result).isEqualTo(new ProductionFulfillmentOutboxWorker.DrainResult(1, 0));
        assertThat(fulfillmentStore.availability("T1", "WH-1", "FG-1"))
                .hasValueSatisfying(fact -> assertThat(fact.path("fulfillableQty").asText()).isEqualTo("5"));
        assertThat(fulfillmentStore.shipmentTasks("T1").get(0).path("replenishmentStatus").asText())
                .isEqualTo("AVAILABLE");
        assertThat(productionStore.outboxEvent("T1", "E1"))
                .hasValueSatisfying(value -> assertThat(value.path("status").asText()).isEqualTo("PUBLISHED"));

        ProductionFulfillmentOutboxWorker.DrainResult replay = worker.drain("T1");
        assertThat(replay).isEqualTo(new ProductionFulfillmentOutboxWorker.DrainResult(0, 0));
    }

    @Test
    void recordsFailureAndDiscoversTenants() {
        ObjectNode availability = mapper.createObjectNode()
                .put("tenantId", "T1").put("warehouseId", "WH-1").put("productId", "FG-1")
                .put("uom", "BOX").put("qualifiedOnHandQty", "1").put("fulfillableQty", "1")
                .put("factVersion", 2);
        fulfillmentStore.availability.put(FulfillmentStore.key("T1", "WH-1", "FG-1"), availability);
        ObjectNode event = completionEvent("E2");
        event.withObject("/payload").put("uom", "PCS");
        productionStore.addOutboxEvent(event);

        ProductionFulfillmentOutboxWorker.DrainResult result = worker.drain("T1");

        assertThat(result).isEqualTo(new ProductionFulfillmentOutboxWorker.DrainResult(0, 1));
        assertThat(productionStore.outboxEvent("T1", "E2"))
                .hasValueSatisfying(value -> assertThat(value.path("status").asText()).isEqualTo("RETRY_WAIT"));
        assertThat(productionStore.pendingOutboxTenantIds("production.completion.posted.v1"))
                .containsExactly("T1");
    }

    private ObjectNode completionEvent(String eventId) {
        ObjectNode event = mapper.createObjectNode()
                .put("id", eventId).put("tenantId", "T1").put("eventId", eventId)
                .put("eventType", "production.completion.posted.v1")
                .put("traceId", "trace-1").put("status", "PENDING")
                .put("retryCount", 0).put("createdAt", Instant.now().toString());
        ObjectNode payload = event.putObject("payload");
        payload.put("eventId", eventId).put("completionId", "CMP-1")
                .put("externalTransactionId", "TX-" + eventId).put("warehouseId", "WH-1")
                .put("productId", "FG-1").put("qty", "5").put("uom", "PCS")
                .put("occurredAt", Instant.now().toString()).put("correlationId", "corr-1");
        ObjectNode allocation = payload.putArray("allocations").addObject();
        allocation.put("demandId", "D-1").put("qty", "5");
        return event;
    }
}
