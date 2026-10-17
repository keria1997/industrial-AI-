package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcJsonCollections;

import javax.sql.DataSource;

public class JdbcFulfillmentStore extends FulfillmentStore implements AutoCloseable {
    private final JdbcJsonCollections collections;

    public JdbcFulfillmentStore(DataSource dataSource, ObjectMapper mapper) {
        this.collections = new JdbcJsonCollections(dataSource, mapper, "fulfillment");
        orders = collections.jsonMap("order");
        shipmentRequests = collections.jsonMap("shipmentRequest");
        shipmentTasks = collections.jsonMap("shipmentTask");
        availability = collections.jsonMap("availability");
        reservations = collections.jsonMap("reservation");
        outbounds = collections.jsonMap("outbound");
        transactions = collections.jsonMap("transaction");
        purchaseRequests = collections.jsonMap("purchaseRequest");
        purchaseOrders = collections.jsonMap("purchaseOrder");
        purchaseReceipts = collections.jsonMap("purchaseReceipt");
        suppliers = collections.jsonMap("supplier");
        purchaseReturns = collections.jsonMap("purchaseReturn");
        warehouses = collections.jsonMap("warehouse");
        products = collections.jsonMap("product");
        materials = collections.jsonMap("material");
        transferOrders = collections.jsonMap("transferOrder");
        stocktakeTasks = collections.jsonMap("stocktakeTask");
        timelines = collections.jsonListMap("timeline");
        inbox = collections.jsonMap("inbox");
        outbox = collections.jsonMap("outbox");
        idempotency = collections.jsonMap("idempotency");
        wmsResults = collections.jsonMap("wmsResult");
        rmas = collections.jsonMap("rma");
        receipts = collections.jsonMap("receipt");
        quotes = collections.jsonMap("quote");
        customers = collections.jsonMap("customer");
        audits = collections.jsonList("audit", value -> value.path("id").asText(""));
    }

    @Override
    public <T> T transaction(java.util.function.Function<FulfillmentStore, T> work) {
        return collections.transaction(() -> super.transaction(work));
    }

    @Override
    public synchronized <T> T transaction(String tenantId, java.util.function.Function<FulfillmentStore, T> work) {
        return collections.transaction(tenantId, () -> work.apply(this));
    }

    @Override
    public synchronized java.util.List<String> pendingOutboxTenantIds() {
        return collections.pendingTenantIds("outbox", "sales.shipment-request.requested.v1");
    }

    @Override
    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        super.markOutboxPublished(tenantId, eventId);
        JsonNode value = outbox.get(FulfillmentStore.key(tenantId, eventId));
        if (value != null) outbox.put(FulfillmentStore.key(tenantId, eventId), value);
    }

    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId) {
        super.markOutboxFailed(tenantId, eventId);
        JsonNode value = outbox.get(FulfillmentStore.key(tenantId, eventId));
        if (value != null) outbox.put(FulfillmentStore.key(tenantId, eventId), value);
    }

    @Override
    public void close() {
        collections.close();
    }
}
