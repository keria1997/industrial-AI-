package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SalesShipmentWorkflowTests {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final String TENANT = "shipment-tests";

    static FulfillmentService service(FulfillmentStore store) {
        return new FulfillmentService(store, MAPPER, "test-key",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
    }

    static RequestContext context(String tenant, JsonNode aggregate, String key) {
        return new RequestContext(tenant, "operator", List.of("*"), "trace-shipment-tests", key,
                aggregate == null ? null : aggregate.path("version").asInt());
    }

    static JsonNode confirmed(FulfillmentService service, String tenant, boolean partial, String... quantities) {
        String date = LocalDate.now(ZoneOffset.UTC).plusDays(7).toString();
        ObjectNode input = MAPPER.createObjectNode().put("customerId", "CUST-TEST")
                .put("ownerEmployeeId", "operator").put("fulfillmentWarehouseId", "WH-TEST")
                .put("factoryResourceId", "FACT-TEST").put("requestedDeliveryDate", date)
                .put("allowPartialShipment", partial).put("currency", "CNY");
        input.putObject("recipient").put("name", "Receiver").put("phone", "13800138000")
                .put("country", "China").put("province", "Shanghai").put("city", "Shanghai")
                .put("address", "Test address");
        var lines = input.putArray("lines");
        for (int index = 0; index < quantities.length; index++) {
            lines.addObject().put("lineNo", index + 1).put("productId", "FG-" + index)
                    .put("orderedQty", quantities[index]).put("uom", "PCS").put("unitPrice", "10")
                    .put("taxRate", "0").put("promisedDate", date).put("allowPartialShipment", partial);
        }
        JsonNode order = service.createOrder(context(tenant, null, UUID.randomUUID().toString()), input).body();
        order = service.decideReview(context(tenant, order, "review-" + order.path("id").asText()),
                order.path("id").asText(), MAPPER.createObjectNode().put("decision", "APPROVE")).body();
        return service.confirmOrder(context(tenant, order, "confirm-" + order.path("id").asText()),
                order.path("id").asText(), MAPPER.createObjectNode().put("requestedDeliveryDate", date)).body();
    }

    static JsonNode request(FulfillmentService service, String tenant, JsonNode order, String qty) {
        ObjectNode input = MAPPER.createObjectNode().put("warehouseId", "WH-TEST");
        var lines = input.putArray("lines");
        for (JsonNode line : order.path("lines")) {
            if (line.path("remainingQty").asText().equals("0")) continue;
            lines.addObject().put("orderLineId", line.path("id").asText())
                    .put("sourceLineRevision", line.path("version").asInt())
                    .put("requestedQty", qty == null ? line.path("remainingQty").asText() : qty).put("uom", "PCS");
        }
        JsonNode result = service.createShipmentRequest(context(tenant, order, "request-" + order.path("id").asText()
                        + "-" + order.path("version").asInt()), order.path("id").asText(), input).body();
        return service.repository().shipmentTaskByRequest(tenant, result.path("id").asText()).orElseThrow();
    }

    static JsonNode stock(FulfillmentService service, String tenant, String product, String qualified, String allocated) {
        return service.repository().transaction(tenant, store -> {
            JsonNode current = store.availability(tenant, "WH-TEST", product).orElse(null);
            ObjectNode fact = MAPPER.createObjectNode().put("tenantId", tenant).put("warehouseId", "WH-TEST")
                    .put("productId", product).put("qualifiedOnHandQty", qualified)
                    .put("allocatedReservedQty", allocated).put("frozenQty", "0").put("safetyStockQty", "0")
                    .put("inTransitQty", "0").put("fulfillableQty",
                            new java.math.BigDecimal(qualified).subtract(new java.math.BigDecimal(allocated)).toPlainString())
                    .put("uom", "PCS").put("formulaVersion", "FULFILLABLE-V1")
                    .put("factVersion", current == null ? 1 : current.path("factVersion").asInt() + 1)
                    .put("asOf", java.time.Instant.now().toString());
            store.saveAvailability(fact);
            return fact;
        });
    }

    static JsonNode reserve(FulfillmentService service, String tenant, JsonNode task) {
        return service.checkAndReserve(context(tenant, task, "reserve-" + task.path("id").asText()
                        + "-" + task.path("version").asInt()), task.path("id").asText(),
                MAPPER.createObjectNode().put("shipmentRequestId", task.path("shipmentRequestId").asText())
                        .put("orderRevision", task.path("orderRevision").asInt())).body();
    }

    static ObjectNode postInput(JsonNode outbound, Map<String, String> quantities) {
        ObjectNode input = MAPPER.createObjectNode().put("shippedAt", "2026-10-13T10:00:00Z");
        var lines = input.putArray("lines");
        for (JsonNode line : outbound.path("lines")) {
            String qty = quantities.get(line.path("productId").asText());
            if (qty != null) lines.addObject().put("outboundLineId", line.path("id").asText()).put("qty", qty).put("uom", "PCS");
        }
        return input;
    }

    static JsonNode post(FulfillmentService service, String tenant, JsonNode outbound, Map<String, String> quantities) {
        return service.postOutbound(context(tenant, outbound, "post-" + outbound.path("id").asText()
                        + "-" + outbound.path("version").asInt()), outbound.path("id").asText(),
                postInput(outbound, quantities)).body();
    }

    @Test
    void partiallyShipsThenReusesOutboundAndCompletesEveryOrderLine() {
        FulfillmentService service = service(new FulfillmentStore());
        JsonNode order = confirmed(service, TENANT, true, "5", "3");
        stock(service, TENANT, "FG-0", "3", "0");
        stock(service, TENANT, "FG-1", "3", "0");
        JsonNode task = request(service, TENANT, order, null);
        JsonNode occupied = service.order(context(TENANT, null, null), order.path("id").asText());
        assertThat(occupied.path("lines").get(0).path("activeRequestedQty").asText()).isEqualTo("5");
        var overRequest = postInput(task, Map.of());
        overRequest.put("warehouseId", "WH-TEST");
        overRequest.withArray("lines").addObject().put("orderLineId", occupied.path("lines").get(0).path("id").asText())
                .put("sourceLineRevision", occupied.path("lines").get(0).path("version").asInt())
                .put("requestedQty", "1").put("uom", "PCS");
        assertThrows(ApiException.class, () -> service.createShipmentRequest(context(TENANT, occupied, "duplicate"),
                order.path("id").asText(), overRequest));
        JsonNode reserved = reserve(service, TENANT, task);
        JsonNode firstOutbound = reserved.path("outbound");
        JsonNode firstPost = post(service, TENANT, firstOutbound, Map.of("FG-0", "2", "FG-1", "3"));
        assertThat(firstPost.path("order").path("overallStatus").asText()).isEqualTo("PARTIALLY_SHIPPED");
        assertThat(firstPost.path("order").path("lines").get(0).path("activeRequestedQty").asText()).isEqualTo("3");
        assertThat(firstPost.path("order").path("lines").get(0).path("reservedQty").asText()).isEqualTo("1");

        stock(service, TENANT, "FG-0", "3", "1");
        JsonNode secondReserve = reserve(service, TENANT, firstPost.path("task"));
        JsonNode secondOutbound = secondReserve.path("outbound");
        assertThat(secondOutbound.path("id")).isEqualTo(firstOutbound.path("id"));
        assertThat(secondOutbound.path("lines").get(0).path("id")).isEqualTo(firstOutbound.path("lines").get(0).path("id"));
        assertThat(secondOutbound.path("lines").get(0).path("postedQty").asText()).isEqualTo("2");
        assertThat(secondReserve.path("task").path("availabilityStatus").asText()).isEqualTo("RESERVED");
        assertThat(service.order(context(TENANT, null, null), order.path("id").asText()).path("overallStatus").asText())
                .isEqualTo("PARTIALLY_SHIPPED");
        JsonNode completed = post(service, TENANT, secondOutbound, Map.of("FG-0", "3"));
        assertThat(completed.path("task").path("workflowStatus").asText()).isEqualTo("COMPLETED");
        assertThat(completed.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        completed.path("order").path("lines").forEach(line -> {
            assertThat(line.path("activeRequestedQty").asText()).isEqualTo("0");
            assertThat(line.path("reservedQty").asText()).isEqualTo("0");
            assertThat(line.path("remainingQty").asText()).isEqualTo("0");
        });
        assertThat(service.repository().transactions(TENANT)).hasSize(3);
        JsonNode replay = post(service, TENANT, secondOutbound, Map.of("FG-0", "3"));
        assertThat(replay).isEqualTo(completed);
        assertThat(service.repository().transactions(TENANT)).hasSize(3);
    }

    @Test
    void createsASecondRequestOnlyForUnoccupiedRemainingQuantity() {
        FulfillmentService service = service(new FulfillmentStore());
        JsonNode order = confirmed(service, TENANT, true, "5");
        stock(service, TENANT, "FG-0", "5", "0");
        JsonNode firstTask = request(service, TENANT, order, "2");
        JsonNode firstResult = post(service, TENANT, reserve(service, TENANT, firstTask).path("outbound"), Map.of("FG-0", "2"));
        assertThat(firstResult.path("task").path("workflowStatus").asText()).isEqualTo("COMPLETED");
        JsonNode secondTask = request(service, TENANT, firstResult.path("order"), null);
        assertThat(secondTask.path("lines").get(0).path("requestedQty").asText()).isEqualTo("3");
        JsonNode completed = post(service, TENANT, reserve(service, TENANT, secondTask).path("outbound"), Map.of("FG-0", "3"));
        assertThat(completed.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        assertThat(service.repository().availability(TENANT, "WH-TEST", "FG-0").orElseThrow()
                .path("qualifiedOnHandQty").asText()).isEqualTo("0");
    }

    @Test
    void rejectsInvalidPostingAndDisallowedPartialShipmentWithoutMutation() {
        FulfillmentService service = service(new FulfillmentStore());
        JsonNode order = confirmed(service, TENANT, false, "5");
        stock(service, TENANT, "FG-0", "5", "0");
        JsonNode task = request(service, TENANT, order, null);
        JsonNode outbound = reserve(service, TENANT, task).path("outbound");
        for (String qty : List.of("0", "-1", "bad", "6", "1.0000001", "2")) {
            assertThrows(ApiException.class, () -> post(service, TENANT, outbound, Map.of("FG-0", qty)));
            assertThat(service.repository().transactions(TENANT)).isEmpty();
            assertThat(service.repository().outbound(TENANT, outbound.path("id").asText()).orElseThrow()).isEqualTo(outbound);
        }
        ObjectNode duplicate = postInput(outbound, Map.of("FG-0", "5"));
        duplicate.withArray("lines").add(duplicate.path("lines").get(0).deepCopy());
        assertThrows(ApiException.class, () -> service.postOutbound(context(TENANT, outbound, "duplicate-post"),
                outbound.path("id").asText(), duplicate));
        JsonNode completed = post(service, TENANT, outbound, Map.of("FG-0", "5"));
        assertThat(completed.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
    }

    @Test
    void rollsBackInventoryOutboundAndReplayResultWhenSalesWriteFails() {
        class FailingStore extends FulfillmentStore {
            boolean fail;
            @Override public synchronized void saveOrder(JsonNode value) {
                super.saveOrder(value);
                if (fail && value.path("overallStatus").asText().equals("SHIPPED")) throw new IllegalStateException("sales write failed");
            }
        }
        FailingStore store = new FailingStore();
        FulfillmentService service = service(store);
        JsonNode order = confirmed(service, TENANT, true, "5");
        stock(service, TENANT, "FG-0", "5", "0");
        JsonNode outbound = reserve(service, TENANT, request(service, TENANT, order, null)).path("outbound");
        JsonNode fact = store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow();
        store.fail = true;
        assertThrows(IllegalStateException.class, () -> post(service, TENANT, outbound, Map.of("FG-0", "5")));
        assertThat(store.outbound(TENANT, outbound.path("id").asText()).orElseThrow()).isEqualTo(outbound);
        assertThat(store.availability(TENANT, "WH-TEST", "FG-0").orElseThrow()).isEqualTo(fact);
        assertThat(store.transactions(TENANT)).isEmpty();
        store.fail = false;
        assertThat(post(service, TENANT, outbound, Map.of("FG-0", "5")).path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        assertThat(store.transactions(TENANT)).hasSize(1);
    }

    @Test
    void retriesFailedHandoffAndLeavesUnconsumedEventsPending() {
        FulfillmentStore store = new FulfillmentStore() {
            boolean fail = true;
            @Override public synchronized void saveShipmentTask(JsonNode value) {
                super.saveShipmentTask(value);
                if (fail) { fail = false; throw new IllegalStateException("handoff failed"); }
            }
        };
        FulfillmentService service = service(store);
        JsonNode order = confirmed(service, TENANT, true, "2");
        ObjectNode input = MAPPER.createObjectNode().put("warehouseId", "WH-TEST");
        input.putArray("lines").addObject().put("orderLineId", order.path("lines").get(0).path("id").asText())
                .put("sourceLineRevision", 2).put("requestedQty", "2").put("uom", "PCS");
        RequestContext context = context(TENANT, order, "handoff");
        JsonNode request = service.createShipmentRequest(context, order.path("id").asText(), input).body();
        assertThat(store.shipmentTasks(TENANT)).isEmpty();
        new FulfillmentOutboxWorker(service).runOnce();
        new FulfillmentOutboxWorker(service).runOnce();
        assertThat(store.shipmentTasks(TENANT)).hasSize(1);
        assertThat(store.shipmentTaskByRequest(TENANT, request.path("id").asText())).isPresent();
        assertThat(service.createShipmentRequest(context, order.path("id").asText(), input).replayed()).isTrue();
        assertThat(store.shipmentTasks(TENANT)).hasSize(1);
        assertThat(store.pendingOutbox(TENANT)).allMatch(event ->
                !event.path("eventType").asText().equals("sales.shipment-request.requested.v1"));
        assertThat(store.pendingOutbox(TENANT)).anyMatch(event ->
                event.path("eventType").asText().equals("sales.order.created.v1"));
    }
}
