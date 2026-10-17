package com.wanshen.platform.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.finance.AbstractFinanceStore;
import com.wanshen.platform.finance.FinanceStore;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.fulfillment.SalesAftercareService;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SalesFulfillmentControllerTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final HttpServletRequest approverRequest = mock(HttpServletRequest.class);
    private final RequestContextService contexts = mock(RequestContextService.class);
    private final FinanceStore financeStore = new FinanceStore();

    @Test
    void completesPrdRmaFlowWithRestockAndCreditNote() {
        FulfillmentStore store = seedShippedOrder("so-1");
        saveOriginalAr("so-1", "16000");
        RequestContext creator = context("creator", "create-key");
        RequestContext approver = context("approver", "command-key");
        org.mockito.Mockito.doReturn(creator).when(contexts).from(request);
        when(contexts.from(approverRequest)).thenReturn(
                context("approver", "approve-key"),
                context("approver", "transit-key"),
                context("approver", "receive-key"),
                context("approver", "inspect-start-key"),
                context("approver", "inspect-key"),
                context("approver", "restock-key"),
                context("approver", "credit-key"),
                context("approver", "close-key")
        );
        SalesAftercareService aftercare = new SalesAftercareService(store, financeStore, mapper);
        SalesFulfillmentController controller = new SalesFulfillmentController(store, aftercare, mapper, contexts);

        Map<String, Object> created = controller.createRma(Map.of(
                "orderId", "so-1", "outboundId", "out-1", "outboundLineId", "out-line-1",
                "requestedQty", "3", "reason", "damaged", "evidence", List.of(Map.of("url", "https://x"))
        ), approverRequest);
        assertEquals("REQUESTED", created.get("status"));
        assertNull(created.get("approvedQty"));
        String rmaId = String.valueOf(created.get("id"));

        Map<String, Object> approved = controller.transitionRma(rmaId, Map.of(
                "transition", "APPROVE", "toStatus", "APPROVED", "decision", "APPROVE",
                "comment", "approved", "approvedQty", "3", "expectedCreditAmount", "4800",
                "currency", "CNY", "version", 1
        ), request);
        assertEquals("APPROVED", approved.get("status"));

        controller.transitionRma(rmaId, transition("TRANSIT_UPDATE", "IN_TRANSIT", 2,
                        Map.of("carrier", "SF", "trackingNo", "SF1", "shippedAt", Instant.now().toString())), approverRequest);
        controller.transitionRma(rmaId, transition("RECEIVE", "RECEIVED", 3,
                Map.of("receivedQty", "3", "warehouseId", "WH-FG-01")), approverRequest);
        controller.transitionRma(rmaId, transition("START_INSPECTION", "INSPECTING", 4, Map.of()), approverRequest);
        Map<String, Object> inspected = controller.transitionRma(rmaId, transition("INSPECT",
                "INSPECTION_COMPLETED", 5, Map.of("qualifiedQty", "3", "reworkQty", "0", "scrapQty", "0",
                        "result", "GOOD")), approverRequest);
        assertEquals("INSPECTION_COMPLETED", inspected.get("status"));
        Map<String, Object> restocked = controller.transitionRma(rmaId, transition("RESTOCK", "RESTOCKED", 6,
                Map.of("restockedQty", "3", "warehouseId", "WH-FG-01", "location", "A-1",
                        "inventoryIdempotencyKey", "restock-key")), approverRequest);
        assertEquals("RESTOCKED", restocked.get("status"));
        Map<String, Object> credited = controller.transitionRma(rmaId, transition("CREDIT_NOTE", "RESTOCKED", 7,
                Map.of("taxBasis", "4800", "currency", "CNY", "reason", "return",
                        "lines", List.of(Map.of("outboundLineId", "out-line-1", "qty", "3")))), approverRequest);
        assertEquals("credit-rma-" + rmaId, credited.get("creditNoteFinanceId"));
        assertEquals("-4800", credited.get("creditNoteAmount"));
        Map<String, Object> closed = controller.transitionRma(rmaId, transition("CLOSE", "CLOSED", 8,
                Map.of("closureCheckId", "check-1", "comment", "all complete")), approverRequest);
        assertEquals("CLOSED", closed.get("status"));
        assertTrue(financeStore.receivable("TENANT-SHWS", "credit-rma-" + rmaId).isPresent());
        assertEquals("3", text(store.availability("TENANT-SHWS", "WH-FG-01", "PROD-1")
                .orElseThrow(), "qualifiedOnHandQty"));
    }

    @Test
    void createsCanonicalReceiptAndCompletesOrder() {
        FulfillmentStore store = seedShippedOrder("so-2");
        saveOriginalAr("so-2", "16000");
        financeStore.saveReceivable(settledClone(
                financeStore.receivableBySource("TENANT-SHWS", "SalesOrder", "so-2").orElseThrow()));
        when(contexts.from(request)).thenReturn(context("creator", "receipt-key"));
        SalesAftercareService aftercare = new SalesAftercareService(store, financeStore, mapper);
        SalesFulfillmentController controller = new SalesFulfillmentController(store, aftercare, mapper, contexts);

        Map<String, Object> receipt = controller.createOrderReceipt("so-2", Map.of(
                "signedBy", "customer", "signedAt", Instant.now().toString(),
                "evidence", List.of(Map.of("url", "https://signed")),
                "lines", List.of(Map.of("orderLineId", "line-1", "outboundId", "out-1",
                        "outboundLineId", "out-line-1", "signedQty", "10",
                        "rejectedQty", "0", "damagedQty", "0"))
        ), request);
        assertEquals("SIGNED", receipt.get("receiptStatus"));
        assertEquals("SIGNED", receipt.get("status"));

        Map<String, Object> check = controller.completeCheck("so-2", Map.of("version", 2), request);
        assertEquals(true, check.get("canComplete"));
        Map<String, Object> completed = controller.completeOrder("so-2",
                Map.of("version", 2, "comment", "closed"), request);
        assertEquals("COMPLETED", completed.get("overallStatus"));
        assertEquals("closure-so-2-2", completed.get("closureFactId"));
    }

    @Test
    void readsRiskAcrossMonthsWithStableOrderId() {
        FulfillmentStore store = new FulfillmentStore();
        String now = Instant.now().toString();
        store.saveOrder(mapper.valueToTree(order("so-old", "SO-OLD", "PENDING_CONFIRMATION",
                "2020-01-01", now, "16000")));
        store.saveOrder(mapper.valueToTree(order("so-current", "SO-CURRENT", "CONFIRMED",
                LocalDate.now().plusDays(10).toString(), now, "1000")));
        when(contexts.from(request)).thenReturn(context("reader", "read-key"));
        SalesAftercareService aftercare = new SalesAftercareService(store, financeStore, mapper);
        SalesFulfillmentController controller = new SalesFulfillmentController(store, aftercare, mapper, contexts);

        Map<String, Object> insights = controller.aiInsights(request);
        assertEquals("AVAILABLE", insights.get("availability"));
        assertEquals(2, insights.get("monthlyOrderCount"));
        assertEquals(1, insights.get("deliveryRiskCount"));
        @SuppressWarnings("unchecked") List<Map<String, Object>> risks =
                (List<Map<String, Object>>) insights.get("deliveryRiskOrders");
        assertEquals("so-old", risks.get(0).get("orderId"));
        assertEquals("SO-OLD", risks.get(0).get("orderNo"));
    }

    private FulfillmentStore seedShippedOrder(String orderId) {
        FulfillmentStore store = new FulfillmentStore();
        Map<String, Object> order = new HashMap<>();
        order.put("id", orderId);
        order.put("tenantId", "TENANT-SHWS");
        order.put("orderNo", orderId.toUpperCase());
        order.put("customerName", "Customer");
        order.put("currency", "CNY");
        order.put("overallStatus", "SHIPPED");
        order.put("version", 2);
        order.put("createdAt", Instant.now().toString());
        order.put("updatedAt", Instant.now().toString());
        order.put("lines", List.of(Map.of("id", "line-1", "productId", "PROD-1",
                "orderedQty", "10", "shippedQty", "10", "unitPrice", "1600")));
        store.saveOrder(mapper.valueToTree(order));

        Map<String, Object> task = new HashMap<>();
        task.put("id", "out-1");
        task.put("tenantId", "TENANT-SHWS");
        task.put("salesOrderId", orderId);
        task.put("version", 1);
        task.put("lines", List.of(Map.of("id", "out-line-1", "orderLineId", "line-1",
                "productId", "PROD-1", "productName", "Product", "postedQty", "10")));
        store.saveShipmentTask(mapper.valueToTree(task));
        return store;
    }

    private void saveOriginalAr(String orderId, String amount) {
        financeStore.saveReceivable(new AbstractFinanceStore.Receivable(
                "ar-" + orderId, "TENANT-SHWS", "AR-" + orderId.toUpperCase(), "Sales AR",
                "cus-1", "Customer", "sales", "SalesOrder", orderId, orderId.toUpperCase(),
                "CNY", amount, "0", amount, "pending", null, null, null, "", 1,
                Instant.now().toString(), Instant.now().toString(), "creator"));
    }

    private AbstractFinanceStore.Receivable settledClone(AbstractFinanceStore.Receivable item) {
        return new AbstractFinanceStore.Receivable(item.id(), item.tenantId(), item.docNo(), item.title(),
                item.customerId(), item.customerName(), item.businessType(), item.sourceType(), item.sourceId(),
                item.sourceDocNo(), item.currency(), item.totalAmount(), item.totalAmount(), "0", "done",
                item.dueDate(), item.issuedAt(), Instant.now().toString(), item.remark(),
                item.version() + 1, item.createdAt(), Instant.now().toString(), item.createdBy());
    }

    private Map<String, Object> transition(String action, String target, Map<String, Object> fields) {
        Map<String, Object> value = new HashMap<>(fields);
        value.put("transition", action);
        value.put("toStatus", target);
        return value;
    }

    private Map<String, Object> transition(String action, String target, int version, Map<String, Object> fields) {
        Map<String, Object> value = transition(action, target, fields);
        value.put("version", version);
        return value;
    }

    private RequestContext context(String actor, String key) {
        return new RequestContext("TENANT-SHWS", actor, List.of("*"), "trace", key, null);
    }

    private Map<String, Object> order(
            String id, String orderNo, String status, String deliveryDate, String time, String totalAmount
    ) {
        Map<String, Object> value = new HashMap<>();
        value.put("id", id);
        value.put("tenantId", "TENANT-SHWS");
        value.put("orderNo", orderNo);
        value.put("customerId", "cus-1");
        value.put("customerName", "Customer");
        value.put("currency", "CNY");
        value.put("totalAmount", totalAmount);
        value.put("overallStatus", status);
        value.put("requestedDeliveryDate", deliveryDate);
        value.put("createdAt", time);
        value.put("updatedAt", time);
        return value;
    }

    private String text(JsonNode value, String field) {
        return value.path(field).asText("");
    }
}
