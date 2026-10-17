package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

public class FulfillmentStore {
    public record IdempotencyRecord(String requestHash, int statusCode, JsonNode body) {}

    Map<String, JsonNode> orders = new LinkedHashMap<>();
    Map<String, JsonNode> shipmentRequests = new LinkedHashMap<>();
    Map<String, JsonNode> shipmentTasks = new LinkedHashMap<>();
    Map<String, JsonNode> availability = new LinkedHashMap<>();
    Map<String, JsonNode> reservations = new LinkedHashMap<>();
    Map<String, JsonNode> outbounds = new LinkedHashMap<>();
    Map<String, JsonNode> transactions = new LinkedHashMap<>();
    Map<String, JsonNode> purchaseRequests = new LinkedHashMap<>();
    Map<String, JsonNode> purchaseOrders = new LinkedHashMap<>();
    Map<String, JsonNode> purchaseReceipts = new LinkedHashMap<>();
    Map<String, JsonNode> suppliers = new LinkedHashMap<>();
    Map<String, JsonNode> purchaseReturns = new LinkedHashMap<>();
    Map<String, JsonNode> warehouses = new LinkedHashMap<>();
    Map<String, JsonNode> products = new LinkedHashMap<>();
    Map<String, JsonNode> materials = new LinkedHashMap<>();
    Map<String, JsonNode> transferOrders = new LinkedHashMap<>();
    Map<String, JsonNode> stocktakeTasks = new LinkedHashMap<>();
    Map<String, List<JsonNode>> timelines = new LinkedHashMap<>();
    Map<String, JsonNode> inbox = new LinkedHashMap<>();
    Map<String, JsonNode> outbox = new LinkedHashMap<>();
    Map<String, JsonNode> idempotency = new LinkedHashMap<>();
    Map<String, JsonNode> wmsResults = new LinkedHashMap<>();
    Map<String, JsonNode> rmas = new LinkedHashMap<>();
    Map<String, JsonNode> receipts = new LinkedHashMap<>();
    Map<String, JsonNode> quotes = new LinkedHashMap<>();
    Map<String, JsonNode> customers = new LinkedHashMap<>();
    Map<String, JsonNode> outreachSettings = new LinkedHashMap<>();
    List<JsonNode> audits = new ArrayList<>();

    public Map<String, JsonNode> rmas(String tenantId) { return filterByTenant(rmas, tenantId); }
    public Map<String, JsonNode> receipts(String tenantId) { return filterByTenant(receipts, tenantId); }
    public Map<String, JsonNode> quotes(String tenantId) { return filterByTenant(quotes, tenantId); }
    public Map<String, JsonNode> customers(String tenantId) { return filterByTenant(customers, tenantId); }
    public Map<String, JsonNode> outreachSettings(String tenantId) { return filterByTenant(outreachSettings, tenantId); }

    public synchronized void saveRma(JsonNode value) {
        rmas.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveReceipt(JsonNode value) {
        receipts.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveQuote(JsonNode value) {
        quotes.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    private Map<String, JsonNode> filterByTenant(Map<String, JsonNode> source, String tenantId) {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        source.forEach((key, value) -> {
            if (value.hasNonNull("tenantId") && tenantId.equals(value.path("tenantId").asText())) {
                result.put(key, value);
            } else if (key.startsWith(tenantId + ":")) {
                result.put(key, value);
            }
        });
        return result;
    }

    public synchronized <T> T transaction(Function<FulfillmentStore, T> work) {
        List<Map<String, JsonNode>> maps = List.of(orders, shipmentRequests, shipmentTasks, availability,
                reservations, outbounds, transactions, purchaseRequests, purchaseOrders, purchaseReceipts,
                suppliers, purchaseReturns, warehouses, products, materials, transferOrders, stocktakeTasks,
                inbox, outbox, idempotency, wmsResults, rmas, receipts, quotes, customers);
        List<Map<String, JsonNode>> before = maps.stream().map(source -> {
            Map<String, JsonNode> values = new LinkedHashMap<>();
            source.forEach((key, value) -> values.put(key, copy(value)));
            return values;
        }).toList();
        Map<String, List<JsonNode>> previousTimelines = new LinkedHashMap<>();
        timelines.forEach((key, values) -> previousTimelines.put(key,
                new ArrayList<>(values.stream().map(FulfillmentStore::copy).toList())));
        List<JsonNode> previousAudits = new ArrayList<>(audits.stream().map(FulfillmentStore::copy).toList());
        try {
            return work.apply(this);
        } catch (RuntimeException exception) {
            for (int index = 0; index < maps.size(); index++) {
                maps.get(index).clear();
                maps.get(index).putAll(before.get(index));
            }
            timelines.clear();
            timelines.putAll(previousTimelines);
            audits.clear();
            audits.addAll(previousAudits);
            throw exception;
        }
    }

    public <T> T transaction(String tenantId, Function<FulfillmentStore, T> work) {
        return transaction(work);
    }

    public synchronized List<String> pendingOutboxTenantIds() {
        return pendingOutbox(null).stream()
                .filter(value -> text(value, "eventType").equals("sales.shipment-request.requested.v1"))
                .map(value -> text(value, "tenantId")).distinct().toList();
    }

    public synchronized Optional<JsonNode> order(String tenantId, String id) {
        return Optional.ofNullable(orders.get(key(tenantId, id))).map(FulfillmentStore::copy);
    }

    public synchronized List<JsonNode> orders(String tenantId) {
        return orders.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized List<JsonNode> purchaseRequests(String tenantId) {
        return list(tenantId, purchaseRequests);
    }

    public synchronized List<JsonNode> purchaseOrders(String tenantId) {
        return list(tenantId, purchaseOrders);
    }

    public synchronized List<JsonNode> purchaseReceipts(String tenantId) {
        return list(tenantId, purchaseReceipts);
    }

    public synchronized List<JsonNode> stocktakeTasks(String tenantId) {
        return list(tenantId, stocktakeTasks);
    }

    public synchronized void savePurchaseRequest(JsonNode value) {
        purchaseRequests.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void savePurchaseOrder(JsonNode value) {
        purchaseOrders.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void savePurchaseReceipt(JsonNode value) {
        purchaseReceipts.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveStocktakeTask(JsonNode value) {
        stocktakeTasks.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized void saveOrder(JsonNode value) {
        orders.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized Optional<JsonNode> shipmentRequest(String tenantId, String id) {
        return Optional.ofNullable(shipmentRequests.get(key(tenantId, id))).map(FulfillmentStore::copy);
    }

    public synchronized void saveShipmentRequest(JsonNode value) {
        shipmentRequests.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized Optional<JsonNode> shipmentTaskByRequest(String tenantId, String requestId) {
        return shipmentTasks.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId)
                        && text(value, "shipmentRequestId").equals(requestId))
                .findFirst()
                .map(FulfillmentStore::copy);
    }

    public synchronized void saveShipmentTask(JsonNode value) {
        shipmentTasks.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized List<JsonNode> shipmentTasks(String tenantId) {
        return shipmentTasks.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized Optional<JsonNode> availability(String tenantId, String warehouseId, String productId) {
        String canonicalId = warehouseId(tenantId, warehouseId);
        List<JsonNode> matches = warehouseAliases(tenantId, canonicalId).stream()
                .map(alias -> availability.get(key(tenantId, alias, productId)))
                .filter(java.util.Objects::nonNull).toList();
        if (matches.size() > 1) {
            throw new ApiException(409, "INVENTORY_409_WAREHOUSE_FACT_CONFLICT",
                    "同一仓库编码和 ID 存在重复库存记录", "核对库存来源后合并重复记录");
        }
        return matches.stream().findFirst().map(value -> {
            ObjectNode fact = value.deepCopy();
            return fact.put("warehouseId", canonicalId);
        });
    }

    public synchronized String warehouseId(String tenantId, String idOrCode) {
        return get(tenantId, idOrCode, warehouses)
                .or(() -> getByCode(tenantId, idOrCode, warehouses))
                .map(value -> text(value, "id")).orElse(idOrCode);
    }

    private List<String> warehouseAliases(String tenantId, String canonicalId) {
        return get(tenantId, canonicalId, warehouses)
                .map(value -> java.util.stream.Stream.of(canonicalId, text(value, "code"))
                        .filter(alias -> !alias.isBlank()).distinct().toList())
                .orElseGet(() -> List.of(canonicalId));
    }

    public synchronized List<JsonNode> availability(String tenantId) {
        Map<String, JsonNode> facts = new LinkedHashMap<>();
        for (JsonNode value : availability.values()) {
            if (!tenantId.equals(text(value, "tenantId"))) continue;
            String canonicalId = warehouseId(tenantId, text(value, "warehouseId"));
            ObjectNode fact = value.deepCopy();
            fact.put("warehouseId", canonicalId);
            if (facts.putIfAbsent(key(canonicalId, text(value, "productId")), fact) != null) {
                throw new ApiException(409, "INVENTORY_409_WAREHOUSE_FACT_CONFLICT",
                        "同一仓库编码和 ID 存在重复库存记录", "核对库存来源后合并重复记录");
            }
        }
        return new ArrayList<>(facts.values());
    }

    public synchronized String saveAvailability(JsonNode value) {
        String tenantId = text(value, "tenantId");
        String productId = text(value, "productId");
        String canonicalId = warehouseId(tenantId, text(value, "warehouseId"));
        String mapKey = key(tenantId, canonicalId, productId);
        JsonNode current = availability(tenantId, canonicalId, productId).orElse(null);
        if (current != null && current.path("factVersion").asInt() >= value.path("factVersion").asInt()) return "STALE";
        if (current != null && !InventoryUnits.compatible(text(current, "uom"), text(value, "uom"))) {
            throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                    "库存事实单位不允许直接变更", "核对产品单位并完成库存单位换算后重试");
        }
        ObjectNode normalized = value.deepCopy();
        normalized.put("warehouseId", canonicalId).put("uom", InventoryUnits.canonical(text(value, "uom")));
        // Move a legacy code-keyed fact in the same transaction as its next stock update.
        List<String> oldKeys = warehouseAliases(tenantId, canonicalId).stream()
                .map(alias -> key(tenantId, alias, productId)).filter(oldKey -> !oldKey.equals(mapKey)).toList();
        oldKeys.forEach(availability::remove);
        availability.put(mapKey, normalized);
        return current == null ? "CREATED" : "UPDATED";
    }

    public synchronized Optional<JsonNode> reservation(String tenantId, String id) {
        return Optional.ofNullable(reservations.get(key(tenantId, id))).map(FulfillmentStore::copy);
    }

    public synchronized List<JsonNode> reservationsByTask(String tenantId, String taskId) {
        return reservations.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId)
                        && text(value, "shipmentTaskId").equals(taskId))
                .sorted((left, right) -> text(left, "createdAt").compareTo(text(right, "createdAt")))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized void saveReservation(JsonNode value) {
        reservations.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized Optional<JsonNode> outbound(String tenantId, String id) {
        return Optional.ofNullable(outbounds.get(key(tenantId, id))).map(FulfillmentStore::copy);
    }

    public synchronized void saveOutbound(JsonNode value) {
        outbounds.put(key(text(value, "tenantId"), text(value, "id")), value.deepCopy());
    }

    public synchronized boolean addTransaction(JsonNode value) {
        String mapKey = key(text(value, "tenantId"), text(value, "externalTransactionId"));
        if (transactions.containsKey(mapKey)) return false;
        transactions.put(mapKey, value.deepCopy());
        return true;
    }

    public synchronized List<JsonNode> transactions(String tenantId) {
        return transactions.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized List<JsonNode> list(String tenantId, Map<String, JsonNode> source) {
        return source.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized Optional<JsonNode> get(String tenantId, String id, Map<String, JsonNode> source) {
        return Optional.ofNullable(source.get(key(tenantId, id))).map(FulfillmentStore::copy);
    }

    public synchronized Optional<JsonNode> getByCode(String tenantId, String code, Map<String, JsonNode> source) {
        return source.values().stream()
                .filter(value -> text(value, "tenantId").equals(tenantId) && text(value, "code").equals(code))
                .findFirst()
                .map(FulfillmentStore::copy);
    }

    public synchronized void put(String tenantId, String id, JsonNode value, Map<String, JsonNode> source) {
        source.put(key(tenantId, id), value.deepCopy());
    }

    public synchronized void remove(String tenantId, String id, Map<String, JsonNode> source) {
        source.remove(key(tenantId, id));
    }

    public synchronized List<JsonNode> timeline(String tenantId, String salesOrderId) {
        return timelines.getOrDefault(key(tenantId, salesOrderId), List.of()).stream()
                .map(FulfillmentStore::copy)
                .sorted((left, right) -> text(left, "occurredAt").compareTo(text(right, "occurredAt")))
                .toList();
    }

    public synchronized List<JsonNode> pendingOutbox(String tenantId) {
        return outbox.values().stream()
                .filter(value -> "PENDING".equals(text(value, "status"))
                        && (tenantId == null || text(value, "tenantId").equals(tenantId)))
                .map(FulfillmentStore::copy)
                .toList();
    }

    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        JsonNode value = outbox.get(key(tenantId, eventId));
        if (value instanceof ObjectNode node) {
            node.put("status", "PUBLISHED").put("attempts", node.path("attempts").asInt() + 1);
        }
    }

    public synchronized void markOutboxFailed(String tenantId, String eventId) {
        JsonNode value = outbox.get(key(tenantId, eventId));
        if (value instanceof ObjectNode node) {
            int attempts = node.path("attempts").asInt() + 1;
            node.put("attempts", attempts).put("status", attempts >= 8 ? "DEAD_LETTER" : "PENDING");
        }
    }

    public synchronized boolean hasInbox(String tenantId, String consumerName, String eventId) {
        return inbox.containsKey(key(tenantId, consumerName, eventId));
    }

    public synchronized void addInbox(String tenantId, String consumerName, JsonNode event) {
        ObjectNode value = event.deepCopy();
        value.put("tenantId", tenantId).put("consumerName", consumerName)
                .put("eventId", text(event, "eventId")).put("processedAt", now());
        inbox.put(key(tenantId, consumerName, text(event, "eventId")), value);
    }

    public synchronized Optional<JsonNode> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(key(tenantId, commandType, key)));
    }

    public synchronized void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash, int statusCode, JsonNode body
    ) {
        ObjectNode record = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode()
                .put("requestHash", requestHash).put("statusCode", statusCode);
        record.set("body", body.deepCopy());
        idempotency.put(key(tenantId, commandType, key), record);
    }

    synchronized void addTimeline(String tenantId, String salesOrderId, JsonNode value) {
        timelines.computeIfAbsent(key(tenantId, salesOrderId), ignored -> new ArrayList<>()).add(value.deepCopy());
    }

    synchronized void addAudit(JsonNode value) {
        audits.add(value.deepCopy());
    }

    synchronized void addOutbox(String tenantId, String eventId, JsonNode value) {
        outbox.put(key(tenantId, eventId), value.deepCopy());
    }

    static JsonNode copy(JsonNode value) { return value.deepCopy(); }

    static String key(String... values) { return String.join(":", values); }

    static String text(JsonNode value, String field) {
        JsonNode node = value.get(field);
        return node == null || node.isNull() ? "" : node.asText();
    }

    private static String now() { return java.time.Instant.now().toString(); }
}
