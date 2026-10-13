package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.wanshen.platform.fulfillment.FulfillmentService;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import org.junit.jupiter.api.Test;

import static com.wanshen.platform.production.ProductionExecutionTests.*;
import static org.assertj.core.api.Assertions.assertThat;

class ProductionSalesChainTests {
    static String salesChain(ProductionStore production, FulfillmentStore inventory, String tenant) {
        var fulfillment = new FulfillmentService(inventory, MAPPER, "TEST",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        var planning = service(production, inventory);
        fulfillment.setProductionDemandCreator((ctx, input) -> planning.createDemand(
                context(tenant, ctx.actorId(), "sales-demand:" + input.path("sourceLineId").asText(), null), input).body());
        JsonNode order = fulfillment.createOrder(context(tenant, "writer", "sales-order", null), json("""
                {"customerId":"CUST1","ownerEmployeeId":"writer","fulfillmentWarehouseId":"FG-WH",
                 "factoryResourceId":"FAC1","requestedDeliveryDate":"2026-11-30","currency":"CNY",
                 "allowPartialShipment":false,
                 "recipient":{"name":"Receiver","phone":"13800138000","country":"China",
                   "province":"Shanghai","city":"Shanghai","address":"Test address"},
                 "lines":[{"lineNo":1,"productId":"FG1","orderedQty":"10","uom":"PCS","unitPrice":"10",
                   "taxRate":"0","promisedDate":"2026-11-30","allowPartialShipment":false}]}
                """)).body();
        String orderId = order.path("id").asText();
        order = fulfillment.decideReview(context(tenant, "writer", "sales-review", order.path("version").asInt()),
                orderId, json("{\"decision\":\"APPROVE\"}")).body();
        order = fulfillment.confirmOrder(context(tenant, "writer", "sales-confirm", order.path("version").asInt()),
                orderId, json("{\"requestedDeliveryDate\":\"2026-11-30\"}")).body();
        var input = json("{\"warehouseId\":\"FG-WH\"}");
        input.putArray("lines").addObject().put("orderLineId", order.path("lines").get(0).path("id").asText())
                .put("sourceLineRevision", order.path("lines").get(0).path("version").asInt()).put("requestedQty", "10").put("uom", "PCS");
        JsonNode request = fulfillment.createShipmentRequest(context(tenant, "writer", "ship-request", order.path("version").asInt()),
                orderId, input).body();
        JsonNode task = inventory.shipmentTaskByRequest(tenant, request.path("id").asText()).orElseThrow();
        var reserveInput = json("{}").put("shipmentRequestId", request.path("id").asText())
                .put("orderRevision", task.path("orderRevision").asInt());
        JsonNode reserved = fulfillment.checkAndReserve(context(tenant, "writer", "reserve-before", task.path("version").asInt()),
                task.path("id").asText(), reserveInput).body();
        task = reserved.path("shipmentTask");
        assertThat(task.path("replenishmentStatus").asText()).isEqualTo("REQUIRED");
        var productionRequest = json("{}");
        productionRequest.putArray("lines").addObject()
                .put("shipmentRequestLineId", task.path("lines").get(0).path("shipmentRequestLineId").asText())
                .put("orderLineId", task.path("lines").get(0).path("orderLineId").asText())
                .put("factoryResourceId", "FAC1").put("dueDate", "2026-11-30");
        JsonNode replenishment = fulfillment.createProductionRequest(
                context(tenant, "writer", "request-production", task.path("version").asInt()),
                task.path("id").asText(), productionRequest).body();
        JsonNode demand = replenishment.path("demands").get(0);
        assertThat(demand.path("sourceType").asText()).isEqualTo("SALES_ORDER_SHORTAGE");
        runChain(production, inventory, tenant, demand);
        task = fulfillment.shipmentTask(context(tenant, "writer", "task-read", null), task.path("id").asText());
        assertThat(task.path("replenishmentStatus").asText()).isEqualTo("AVAILABLE");
        reserved = fulfillment.checkAndReserve(context(tenant, "writer", "reserve-after", task.path("version").asInt()),
                task.path("id").asText(), reserveInput).body();
        JsonNode outbound = reserved.path("outbound");
        var post = json("{\"shippedAt\":\"2026-10-13T12:00:00Z\"}");
        post.putArray("lines").addObject().put("outboundLineId", outbound.path("lines").get(0).path("id").asText())
                .put("qty", "10").put("uom", "PCS");
        JsonNode shipped = fulfillment.postOutbound(context(tenant, "writer", "post", outbound.path("version").asInt()),
                outbound.path("id").asText(), post).body();
        assertThat(shipped.path("order").path("overallStatus").asText()).isEqualTo("SHIPPED");
        assertThat(shipped.path("order").path("lines").get(0).path("remainingQty").asText()).isEqualTo("0");
        assertThat(shipped.path("task").path("workflowStatus").asText()).isEqualTo("COMPLETED");
        assertThat(inventory.availability(tenant, "FG-WH", "FG1").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("0");
        assertThat(fulfillment.postOutbound(context(tenant, "writer", "post", outbound.path("version").asInt()),
                outbound.path("id").asText(), post).replayed()).isTrue();
        assertThat(inventory.transactions(tenant)).hasSize(4);
        return orderId;
    }

    @Test void salesShortageCompletesProductionThenShipsTheOriginalOrder() {
        salesChain(new ProductionStore(), new FulfillmentStore(), "T-SALES-PRODUCTION");
    }
}
