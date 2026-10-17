package com.wanshen.platform.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SalesFulfillmentControllerTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final RequestContextService contexts = mock(RequestContextService.class);
    private final RequestContext context = new RequestContext(
            "TENANT-SHWS", "tester", List.of("*"), "trace", "same-command-key", null);

    @Test
    void approvesInspectsAndClosesRmaWithTenantLookupAndIdempotency() {
        when(contexts.from(request)).thenReturn(context);
        FulfillmentStore store = new FulfillmentStore();
        store.saveOrder(mapper.valueToTree(Map.of("id", "so-1", "tenantId", "TENANT-SHWS")));
        store.saveRma(mapper.valueToTree(Map.of(
                "id", "rma-1", "tenantId", "TENANT-SHWS", "orderId", "so-1",
                "status", "REQUESTED", "requestedQty", "2", "version", 1
        )));
        SalesFulfillmentController controller = new SalesFulfillmentController(store, mapper, contexts);

        Map<String, Object> firstApproval = controller.approveRma(
                "rma-1", Map.of("approvedQty", "2"), request);
        assertEquals("APPROVED", firstApproval.get("status"));
        assertEquals(2, firstApproval.get("version"));

        Map<String, Object> replay = controller.approveRma(
                "rma-1", Map.of("approvedQty", "2"), request);
        assertEquals(firstApproval, replay);

        Map<String, Object> inspected = controller.inspectRma("rma-1",
                Map.of("receivedQty", "2", "qualifiedQty", "1", "scrapQty", "1"), request);
        assertEquals("INSPECTION_COMPLETED", inspected.get("status"));

        Map<String, Object> closed = controller.closeRma("rma-1", request);
        assertEquals("CLOSED", closed.get("status"));
        assertEquals("ar-rma-rma-1", closed.get("creditArId"));
    }

    @Test
    void createsCustomerReceiptInTenantStoreWithValidatedQuantity() {
        when(contexts.from(request)).thenReturn(context);
        FulfillmentStore store = new FulfillmentStore();
        store.saveOrder(mapper.valueToTree(Map.of("id", "so-1", "tenantId", "TENANT-SHWS")));
        SalesFulfillmentController controller = new SalesFulfillmentController(store, mapper, contexts);

        Map<String, Object> receipt = controller.createReceipt(Map.of(
                "orderId", "so-1", "signedQty", "8", "rejectedQty", "1",
                "damagedQty", "1", "totalShippedQty", "10"
        ), request);

        assertEquals("DISPUTED", receipt.get("status"));
        assertEquals(1, store.receipts("TENANT-SHWS").size());
    }

    @Test
    void buildsSalesInsightsFromMonthlyOrderFactsAndMarksEmptyScope() {
        when(contexts.from(request)).thenReturn(context);
        FulfillmentStore store = new FulfillmentStore();
        SalesFulfillmentController controller = new SalesFulfillmentController(store, mapper, contexts);

        Map<String, Object> empty = controller.aiInsights(request);
        assertEquals("EMPTY", empty.get("availability"));
        assertEquals(0, empty.get("monthlyOrderCount"));

        String now = java.time.Instant.now().toString();
        String fourDaysAgo = java.time.Instant.now().minus(java.time.Duration.ofDays(4)).toString();
        store.saveOrder(mapper.valueToTree(order("so-1", "SO-1", "cus-001", "Customer One",
                "16000", "PENDING_CONFIRMATION", fourDaysAgo, java.time.LocalDate.now().toString())));
        store.saveOrder(mapper.valueToTree(order("so-2", "SO-2", "cus-002", "Customer Two",
                "386000", "CONFIRMED", now, java.time.LocalDate.now().plusDays(10).toString())));

        Map<String, Object> available = controller.aiInsights(request);
        assertEquals("AVAILABLE", available.get("availability"));
        assertEquals("CNY", available.get("currency"));
        assertEquals(now, available.get("dataAsOf"));
        assertEquals("sales-order-v1", available.get("sourceVersion"));
        assertEquals(2, available.get("monthlyOrderCount"));
        assertEquals("402000", available.get("totalSalesAmount"));
        assertEquals(1, available.get("stalledCount"));
        assertEquals(1, available.get("deliveryRiskCount"));
    }

    private Map<String, Object> order(
            String id, String orderNo, String customerId, String customerName,
            String totalAmount, String overallStatus, String time, String deliveryDate) {
        Map<String, Object> value = new java.util.HashMap<>();
        value.put("id", id);
        value.put("tenantId", "TENANT-SHWS");
        value.put("orderNo", orderNo);
        value.put("customerId", customerId);
        value.put("customerName", customerName);
        value.put("currency", "CNY");
        value.put("totalAmount", totalAmount);
        value.put("overallStatus", overallStatus);
        value.put("requestedDeliveryDate", deliveryDate);
        value.put("createdAt", time);
        value.put("updatedAt", time);
        return value;
    }
}
