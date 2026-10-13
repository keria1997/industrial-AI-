package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcJsonCollections;

import javax.sql.DataSource;
import java.util.List;

public class JdbcProductionStore extends ProductionStore implements AutoCloseable {
    private final JdbcJsonCollections collections;

    public JdbcProductionStore(DataSource dataSource, ObjectMapper mapper) {
        this.collections = new JdbcJsonCollections(dataSource, mapper, "production");
        demands = collections.jsonMap("demand");
        demandSources = collections.jsonMap("demandSource");
        workOrders = collections.jsonMap("workOrder");
        workOrderDemands = collections.jsonMap("workOrderDemand");
        workReports = collections.jsonMap("workReport");
        reportCorrections = collections.jsonMap("reportCorrection");
        inspections = collections.jsonMap("inspection");
        reworkOrders = collections.jsonMap("reworkOrder");
        completions = collections.jsonMap("completion");
        completionAllocations = collections.jsonMap("completionAllocation");
        closeRequests = collections.jsonMap("closeRequest");
        tasks = collections.jsonMap("operationTask");
        statusHistory = collections.jsonList("statusHistory", value -> value.path("id").asText(""));
        outboxEvents = collections.jsonList("outbox", value -> value.path("eventId").asText(""));
        auditLogs = collections.jsonList("audit", value -> value.path("id").asText(""));
        idempotency = collections.jsonMap("idempotency");
        inventoryAvailability = collections.jsonMap("inventoryAvailability");
        inboxEvents = collections.jsonMap("inboxEvent");
        salesOrderIntakes = collections.jsonMap("salesOrderIntake");
        materialTransactionBlockers = collections.jsonMap("materialTransactionBlocker");
    }

    @Override
    public <T> T transaction(java.util.function.Function<ProductionStore, T> work) {
        return collections.transaction(() -> super.transaction(work));
    }

    @Override
    public synchronized List<JsonNode> pendingOutbox(String tenantId, String eventType) {
        return outboxEvents.stream()
                .filter(value -> "PENDING".equals(ProductionStore.text(value, "status"))
                        || "RETRY_WAIT".equals(ProductionStore.text(value, "status")))
                .filter(value -> (tenantId == null || ProductionStore.text(value, "tenantId").equals(tenantId))
                        && (eventType == null || ProductionStore.text(value, "eventType").equals(eventType)))
                .map(value -> (JsonNode) value.deepCopy())
                .toList();
    }

    @Override
    public synchronized List<String> pendingOutboxTenantIds(String eventType) {
        return outboxEvents.stream()
                .filter(value -> "PENDING".equals(ProductionStore.text(value, "status")))
                .filter(value -> ProductionStore.text(value, "eventType").equals(eventType))
                .map(value -> ProductionStore.text(value, "tenantId"))
                .distinct()
                .sorted()
                .toList();
    }

    @Override
    public void close() {
        collections.close();
    }
}
