package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static com.wanshen.platform.fulfillment.SalesShipmentWorkflowTests.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class QuickSalesOrderMetadataTests {
    static ObjectNode input() {
        String date = LocalDate.now(ZoneOffset.UTC).toString();
        String delivery = LocalDate.now(ZoneOffset.UTC).plusDays(7).toString();
        ObjectNode input = MAPPER.createObjectNode().put("customerId", "CUST-TEST")
                .put("customerName", "Metadata customer").put("ownerEmployeeId", "operator")
                .put("fulfillmentWarehouseId", "WH-TEST").put("factoryResourceId", "FACT-TEST")
                .put("requestedDeliveryDate", delivery).put("orderDate", date)
                .put("validUntil", LocalDate.now(ZoneOffset.UTC).plusDays(30).toString())
                .put("remark", "Order remark").put("allowPartialShipment", true).put("currency", "CNY")
                .put("discountRate", "90").put("discountAmount", "12").put("expectedTotalAmount", "420");
        input.putObject("recipient").put("name", "Receiver").put("phone", "13800138000")
                .put("country", "China").put("province", "Shanghai").put("city", "Shanghai")
                .put("address", "Test address");
        var lines = input.putArray("lines");
        for (int index = 0; index < 2; index++) {
            lines.addObject().put("lineNo", index + 1).put("productId", "FG-" + index)
                    .put("productName", "Product " + index).put("specification", "Spec " + index)
                    .put("orderedQty", index == 0 ? "2" : "3").put("unitPrice", index == 0 ? "120" : "80")
                    .put("uom", "PCS").put("taxRate", "0").put("promisedDate", delivery)
                    .put("allowPartialShipment", true);
        }
        return input;
    }

    static void assertMetadata(JsonNode order, JsonNode input) {
        for (String field : List.of("orderDate", "validUntil", "remark")) {
            assertThat(order.path(field)).isEqualTo(input.path(field));
        }
        assertThat(order.path("overallStatus").asText()).isEqualTo("PENDING_CONFIRMATION");
        assertThat(order.path("shipmentStatus").asText()).isEqualTo("NOT_REQUESTED");
        assertThat(new java.math.BigDecimal(order.path("totalAmount").asText())).isEqualByComparingTo("420");
        for (int index = 0; index < 2; index++) {
            for (String field : List.of("productName", "specification", "orderedQty", "unitPrice")) {
                assertThat(order.path("lines").get(index).path(field))
                        .isEqualTo(input.path("lines").get(index).path(field));
            }
        }
    }

    @Test
    void persistsMetadataInOrderReadListAuditAndIdempotentReplay() {
        var service = service(new FulfillmentStore());
        var input = input();
        var request = context(TENANT, null, "quick-metadata");
        var order = service.createOrder(request, input).body();
        assertMetadata(order, input);
        assertMetadata(service.order(context(TENANT, null, null), order.path("id").asText()), input);
        assertThat(service.listOrders(context(TENANT, null, null), null, null, null, null, 1, 20).get("total"))
                .isEqualTo(1);
        assertThat(service.createOrder(request, input).replayed()).isTrue();
        assertThat(service.repository().audits).hasSize(1);
        assertMetadata(service.repository().audits.get(0).path("afterSnapshot"), input);
        assertThat(service.repository().shipmentTasks(TENANT)).isEmpty();
    }

    @Test
    void validatesCalendarDatesTextTypesLimitsAndMergedPatch() {
        var service = service(new FulfillmentStore());
        for (var invalid : List.of(
                input().put("orderDate", "2026-02-30"),
                input().put("validUntil", "2020-01-01"),
                input().put("remark", "x".repeat(1001)),
                input().put("remark", 123))) {
            assertThrows(ApiException.class, () -> service.createOrder(context(TENANT, null, "invalid"), invalid));
        }
        var badLine = input();
        ((ObjectNode) badLine.path("lines").get(0)).put("specification", "x".repeat(201));
        assertThrows(ApiException.class, () -> service.createOrder(context(TENANT, null, "invalid-line"), badLine));
        var order = service.createOrder(context(TENANT, null, "valid"), input()).body();
        assertThrows(ApiException.class, () -> service.updateOrder(context(TENANT, order, "bad-patch"),
                order.path("id").asText(), MAPPER.createObjectNode().put("validUntil", "2020-01-01")));
        var updated = service.updateOrder(context(TENANT, order, "good-patch"), order.path("id").asText(),
                MAPPER.createObjectNode().put("remark", "")).body();
        assertThat(updated.path("remark").asText()).isEmpty();
        assertThat(updated.path("validUntil")).isEqualTo(order.path("validUntil"));
    }
}
