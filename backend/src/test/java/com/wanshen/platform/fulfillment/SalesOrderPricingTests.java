package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SalesOrderPricingTests {
    final ObjectMapper mapper = new ObjectMapper();
    FulfillmentService service;

    @BeforeEach
    void setUp() {
        service = new FulfillmentService(new FulfillmentStore(), mapper, "test-key",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
    }

    static RequestContext context(String tenant, Integer version) {
        return new RequestContext(tenant, "price-test", List.of("*"), "price-test",
                UUID.randomUUID().toString(), version);
    }

    static ObjectNode input(ObjectMapper mapper) throws Exception {
        String date = LocalDate.now().plusDays(7).toString();
        return (ObjectNode) mapper.readTree("""
                {"customerId":"PRICE-TEST","ownerEmployeeId":"price-test",
                 "fulfillmentWarehouseId":"WH-01","factoryResourceId":"FAC-01",
                 "requestedDeliveryDate":"%s","allowPartialShipment":true,"currency":"CNY",
                 "discountRate":"95","discountAmount":"120","expectedTotalAmount":"9133.00",
                 "recipient":{"name":"Price test","phone":"13800138000","country":"CN",
                              "province":"Shanghai","city":"Shanghai","address":"Test"},
                 "lines":[
                    {"lineNo":1,"productId":"FG-01","orderedQty":"3","uom":"PCS","unitPrice":"1680",
                     "taxRate":"0","promisedDate":"%s","allowPartialShipment":true},
                    {"lineNo":2,"productId":"FG-02","orderedQty":"2","uom":"PCS","unitPrice":"2350",
                     "taxRate":"0","promisedDate":"%s","allowPartialShipment":true}]}
                """.formatted(date, date, date));
    }

    @Test
    void preservesDiscountedAmountThroughApprovalConfirmationAndRead() throws Exception {
        ObjectNode input = input(mapper);
        var created = service.createOrder(context("price-tests", null), input).body();
        String id = created.path("id").asText();
        assertEquals("9740", created.path("originalAmount").asText());
        assertEquals("9133", created.path("totalAmount").asText());
        var approved = service.decideReview(context("price-tests", 1), id,
                mapper.createObjectNode().put("decision", "APPROVE")).body();
        var confirmed = service.confirmOrder(context("price-tests", 2), id,
                mapper.createObjectNode().put("requestedDeliveryDate", input.path("requestedDeliveryDate").asText())).body();
        assertEquals(created.path("totalAmount"), approved.path("totalAmount"));
        assertEquals(created.path("totalAmount"), confirmed.path("totalAmount"));
        assertEquals("95", confirmed.path("discountRate").asText());
        assertEquals("120", confirmed.path("discountAmount").asText());
        assertEquals("9133", service.order(context("price-tests", null), id).path("totalAmount").asText());
    }

    @Test
    void keepsDiscountsOnDateEditsAndRecalculatesWhenDiscountsAreEdited() throws Exception {
        ObjectNode input = input(mapper);
        String id = service.createOrder(context("price-tests", null), input).body().path("id").asText();
        var unchanged = service.updateOrder(context("price-tests", 1), id,
                mapper.createObjectNode().put("requestedDeliveryDate", input.path("requestedDeliveryDate").asText())).body();
        assertEquals("9133", unchanged.path("totalAmount").asText());
        var changed = service.updateOrder(context("price-tests", 2), id,
                mapper.createObjectNode().put("discountRate", "90").put("expectedTotalAmount", "8646")).body();
        assertEquals("8646", changed.path("totalAmount").asText());
        assertEquals("120", changed.path("discountAmount").asText());
    }

    @Test
    void rejectsMismatchedAmountWithoutCreatingAnOrder() throws Exception {
        ObjectNode input = input(mapper).put("expectedTotalAmount", "9740");
        ApiException error = assertThrows(ApiException.class,
                () -> service.createOrder(context("price-tests", null), input));
        assertEquals(422, error.status());
        assertTrue(service.repository().orders.isEmpty());
    }

    @Test
    void rejectsInvalidDiscounts() throws Exception {
        for (String value : List.of("-1", "100.01", "invalid")) {
            ObjectNode input = input(mapper).put("discountRate", value);
            assertEquals(400, assertThrows(ApiException.class,
                    () -> service.createOrder(context("price-tests", null), input)).status());
        }
        ObjectNode negativeDiscount = input(mapper).put("discountAmount", "-1");
        assertEquals(400, assertThrows(ApiException.class,
                () -> service.createOrder(context("price-tests", null), negativeDiscount)).status());
    }

    @Test
    void roundsDecimalMoneyOnceAndSupportsZeroTotals() throws Exception {
        ObjectNode input = input(mapper).put("discountRate", "100").put("discountAmount", "0")
                .put("expectedTotalAmount", "1.01");
        input.withArray("lines").remove(1);
        ((ObjectNode) input.withArray("lines").get(0)).put("orderedQty", "1").put("unitPrice", "1.005");
        assertEquals("1.01", service.createOrder(context("price-tests", null), input).body().path("totalAmount").asText());
        input.put("discountRate", "0").put("expectedTotalAmount", "0");
        assertEquals("0", service.createOrder(context("price-tests", null), input).body().path("totalAmount").asText());
    }
}
