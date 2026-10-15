package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

public class ProductionStore {
    public record IdempotencyRecord(String requestHash, int statusCode, JsonNode body) {}

    Map<String, JsonNode> demands = new LinkedHashMap<>();
    Map<String, JsonNode> demandSources = new LinkedHashMap<>();
    Map<String, JsonNode> workOrders = new LinkedHashMap<>();
    Map<String, JsonNode> workOrderDemands = new LinkedHashMap<>();
    Map<String, JsonNode> workReports = new LinkedHashMap<>();
    Map<String, JsonNode> reportCorrections = new LinkedHashMap<>();
    Map<String, JsonNode> inspections = new LinkedHashMap<>();
    Map<String, JsonNode> reworkOrders = new LinkedHashMap<>();
    Map<String, JsonNode> completions = new LinkedHashMap<>();
    Map<String, JsonNode> completionAllocations = new LinkedHashMap<>();
    Map<String, JsonNode> closeRequests = new LinkedHashMap<>();
    Map<String, JsonNode> tasks = new LinkedHashMap<>();
    List<JsonNode> statusHistory = new ArrayList<>();
    List<JsonNode> outboxEvents = new ArrayList<>();
    List<JsonNode> auditLogs = new ArrayList<>();
    Map<String, JsonNode> idempotency = new LinkedHashMap<>();
    Map<String, JsonNode> inventoryAvailability = new LinkedHashMap<>();
    Map<String, JsonNode> inboxEvents = new LinkedHashMap<>();
    Map<String, JsonNode> salesOrderIntakes = new LinkedHashMap<>();
    Map<String, JsonNode> materialTransactionBlockers = new LinkedHashMap<>();
    Map<String, JsonNode> bomSnapshots = new LinkedHashMap<>();

    public synchronized <T> T transaction(Supplier<T> work) {
        return work.get();
    }

    public synchronized <T> T transaction(java.util.function.Function<ProductionStore, T> work) {
        List<Map<String, JsonNode>> maps = List.of(demands, demandSources, workOrders, workOrderDemands,
                workReports, reportCorrections, inspections, reworkOrders, completions, completionAllocations,
                closeRequests, tasks, idempotency, inventoryAvailability, inboxEvents, salesOrderIntakes,
                materialTransactionBlockers, bomSnapshots);
        List<Map<String, JsonNode>> before = maps.stream().map(source -> {
            Map<String, JsonNode> copy = new LinkedHashMap<>();
            source.forEach((key, value) -> copy.put(key, value.deepCopy()));
            return copy;
        }).toList();
        List<JsonNode> history = statusHistory.stream().map(ProductionStore::copy).toList();
        List<JsonNode> outbox = outboxEvents.stream().map(ProductionStore::copy).toList();
        List<JsonNode> audits = auditLogs.stream().map(ProductionStore::copy).toList();
        try { return work.apply(this); }
        catch (RuntimeException exception) {
            for (int index = 0; index < maps.size(); index++) { maps.get(index).clear(); maps.get(index).putAll(before.get(index)); }
            statusHistory.clear(); statusHistory.addAll(history);
            outboxEvents.clear(); outboxEvents.addAll(outbox);
            auditLogs.clear(); auditLogs.addAll(audits);
            throw exception;
        }
    }

    public <T> T transaction(String tenantId, java.util.function.Function<ProductionStore, T> work) {
        return transaction(work);
    }

    public synchronized Optional<JsonNode> bom(String tenantId, String productId) {
        return Optional.ofNullable(bomSnapshots.get(key(tenantId, productId))).map(ProductionStore::copy);
    }

    public synchronized List<JsonNode> pendingOutbox(String tenantId, String eventType) {
        return outboxEvents.stream()
                .filter(item -> text(item, "tenantId").equals(tenantId)
                        && Set.of("PENDING", "RETRY_WAIT").contains(text(item, "status"))
                        && (eventType == null || text(item, "eventType").equals(eventType)))
                .map(ProductionStore::copy)
                .toList();
    }

    public synchronized List<String> pendingOutboxTenantIds(String eventType) {
        return outboxEvents.stream()
                .filter(item -> Set.of("PENDING", "RETRY_WAIT").contains(text(item, "status"))
                        && text(item, "eventType").equals(eventType))
                .map(item -> text(item, "tenantId"))
                .distinct()
                .sorted()
                .toList();
    }

    public synchronized void addOutboxEvent(JsonNode event) {
        outboxEvents.add(copy(event));
    }

    public synchronized Optional<JsonNode> outboxEvent(String tenantId, String eventId) {
        return outboxEvents.stream()
                .filter(item -> text(item, "tenantId").equals(tenantId)
                        && text(item, "eventId").equals(eventId))
                .findFirst()
                .map(ProductionStore::copy);
    }

    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        replaceOutbox(tenantId, eventId, value -> {
            ObjectNode updated = (ObjectNode) value.deepCopy();
            updated.put("status", "PUBLISHED")
                    .put("retryCount", value.path("retryCount").asInt() + 1)
                    .put("publishedAt", java.time.Instant.now().toString());
            updated.remove("errorMessage");
            updated.remove("nextRetryAt");
            return updated;
        });
    }

    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        replaceOutbox(tenantId, eventId, value -> {
            int retryCount = value.path("retryCount").asInt() + 1;
            ObjectNode updated = (ObjectNode) value.deepCopy();
            updated.put("status", retryCount >= maxAttempts ? "DEAD_LETTER" : "RETRY_WAIT")
                    .put("retryCount", retryCount)
                    .put("nextRetryAt", java.time.Instant.now().toString());
            updated.put("errorMessage", error == null ? "Unknown completion relay error" : error.substring(
                    0, Math.min(error.length(), 1000)));
            return updated;
        });
    }

    private void replaceOutbox(String tenantId, String eventId, java.util.function.Function<JsonNode, JsonNode> change) {
        for (int index = 0; index < outboxEvents.size(); index++) {
            JsonNode value = outboxEvents.get(index);
            if (!text(value, "tenantId").equals(tenantId) || !text(value, "eventId").equals(eventId)) continue;
            outboxEvents.set(index, change.apply(value));
            return;
        }
    }

    public synchronized Optional<JsonNode> demand(String tenantId, String id) {
        return Optional.ofNullable(demands.get(key(tenantId, id))).map(ProductionStore::copy);
    }

    public synchronized Optional<JsonNode> demandSource(String tenantId, String demandId) {
        return demandSources.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId) && text(item, "demandId").equals(demandId))
                .findFirst()
                .map(ProductionStore::copy);
    }

    public synchronized List<JsonNode> demands(
            String tenantId, String status, String factoryResourceId, String search, int limit, int offset
    ) {
        List<JsonNode> values = demands.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId))
                .filter(item -> !item.path("archived").asBoolean())
                .filter(item -> status == null || text(item, "status").equals(status))
                .filter(item -> factoryResourceId == null || text(item, "factoryResourceId").equals(factoryResourceId))
                .filter(item -> matches(search, text(item, "code"), text(item, "productId"), text(item, "productName")))
                .sorted((left, right) -> text(right, "createdAt").compareTo(text(left, "createdAt")))
                .toList();
        return page(values, limit, offset);
    }

    public synchronized Optional<JsonNode> workOrder(String tenantId, String id) {
        return Optional.ofNullable(workOrders.get(key(tenantId, id))).map(ProductionStore::copy);
    }

    public synchronized List<JsonNode> workOrders(
            String tenantId, String status, String factoryResourceId, String search, int limit, int offset
    ) {
        List<JsonNode> values = workOrders.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId))
                .filter(item -> status == null || text(item, "status").equals(status))
                .filter(item -> factoryResourceId == null || text(item, "factoryResourceId").equals(factoryResourceId))
                .filter(item -> matches(search, text(item, "code"), text(item, "productId"), text(item, "productName")))
                .sorted((left, right) -> text(right, "createdAt").compareTo(text(left, "createdAt")))
                .toList();
        return page(values, limit, offset);
    }

    public synchronized Optional<JsonNode> inspection(String tenantId, String id) {
        return Optional.ofNullable(inspections.get(key(tenantId, id))).map(ProductionStore::copy);
    }

    public synchronized List<JsonNode> inspections(String tenantId, String workOrderId) {
        return inspections.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId))
                .filter(item -> workOrderId == null || text(item, "workOrderId").equals(workOrderId))
                .map(ProductionStore::copy)
                .toList();
    }

    public synchronized void saveDemand(JsonNode value) {
        demands.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveWorkOrder(JsonNode value) {
        workOrders.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveInspection(JsonNode value) {
        inspections.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized Optional<JsonNode> completion(String tenantId, String id) {
        return Optional.ofNullable(completions.get(key(tenantId, id))).map(ProductionStore::copy);
    }

    public synchronized List<JsonNode> completions(String tenantId, String workOrderId) {
        return completions.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId))
                .filter(item -> workOrderId == null || text(item, "workOrderId").equals(workOrderId))
                .map(ProductionStore::copy)
                .toList();
    }

    public synchronized List<JsonNode> completionAllocations(String tenantId, String completionId) {
        return completionAllocations.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId) && text(item, "completionId").equals(completionId))
                .map(ProductionStore::copy)
                .toList();
    }

    public synchronized Optional<JsonNode> task(String tenantId, String id) {
        return Optional.ofNullable(tasks.get(key(tenantId, id))).map(ProductionStore::copy);
    }

    public synchronized List<String> serialNumbers(String tenantId) {
        return completions.values().stream()
                .filter(item -> text(item, "tenantId").equals(tenantId))
                .flatMap(item -> array(item, "serialNumbers").stream())
                .map(JsonNode::asText)
                .toList();
    }

    public synchronized boolean materialBlocked(String tenantId, String workOrderId) {
        return materialTransactionBlockers
                .getOrDefault(key(tenantId, workOrderId), com.fasterxml.jackson.databind.node.BooleanNode.FALSE)
                .asBoolean();
    }

    public synchronized void setMaterialBlocked(String tenantId, String workOrderId, boolean blocked) {
        materialTransactionBlockers.put(key(tenantId, workOrderId),
                com.fasterxml.jackson.databind.node.BooleanNode.valueOf(blocked));
    }

    public synchronized Optional<JsonNode> inventoryAvailability(String tenantId, String productId, String warehouseId) {
        return Optional.ofNullable(inventoryAvailability.get(key(tenantId, productId, warehouseId)))
                .map(ProductionStore::copy);
    }

    public synchronized Optional<JsonNode> idempotency(
            String tenantId, String commandType, String idempotencyKey
    ) {
        return Optional.ofNullable(idempotency.get(key(tenantId, commandType, idempotencyKey)));
    }

    static JsonNode copy(JsonNode value) { return value.deepCopy(); }

    static String key(String... values) { return String.join(":", values); }

    static String text(JsonNode value, String field) {
        JsonNode node = value.get(field);
        return node == null || node.isNull() ? "" : node.asText();
    }

    static List<JsonNode> array(JsonNode value, String field) {
        JsonNode node = value.get(field);
        List<JsonNode> result = new ArrayList<>();
        if (node != null && node.isArray()) node.forEach(result::add);
        return result;
    }

    static boolean matches(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        String normalized = query.toLowerCase();
        return Arrays.stream(fields)
                .filter(value -> !value.isBlank())
                .anyMatch(value -> value.toLowerCase().contains(normalized));
    }

    static <T> List<T> page(List<T> values, int limit, int offset) {
        int from = Math.min(Math.max(offset, 0), values.size());
        int to = Math.min(from + Math.max(limit, 0), values.size());
        return List.copyOf(values.subList(from, to));
    }
}
