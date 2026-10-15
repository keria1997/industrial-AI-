package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.production.ProductionInventoryPort;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Inventory owns material reservations and consumption, including retry recovery. */
public class ProductionInventoryAdapter implements ProductionInventoryPort {
    private final FulfillmentStore store;
    private final ObjectMapper mapper;

    public ProductionInventoryAdapter(FulfillmentStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    @Override
    public List<JsonNode> check(String tenantId, List<JsonNode> requirements) {
        return store.transaction(tenantId, repository -> checkInside(tenantId, requirements));
    }

    private List<JsonNode> checkInside(String tenantId, List<JsonNode> requirements) {
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode requirement : requirements) {
            JsonNode fact = store.availability(tenantId, requirement.path("warehouseId").asText(),
                    requirement.path("materialId").asText()).orElse(null);
            String available = fact == null ? "0" : fact.path("fulfillableQty").asText("0");
            if (fact != null && !fact.path("uom").asText().equals(requirement.path("uom").asText())) {
                throw new ApiException(424, "PRODUCTION_424_DEPENDENCY_FAILED",
                        "物料库存单位与 BOM 不一致", "核对物料单位后重试");
            }
            BigDecimal shortage = new BigDecimal(requirement.path("grossRequiredQty").asText())
                    .subtract(new BigDecimal(available)).max(BigDecimal.ZERO);
            ObjectNode line = requirement.deepCopy();
            line.put("availableQty", available).put("shortageQty", decimal(shortage))
                    .put("inventoryFactVersion", fact == null ? 0 : fact.path("factVersion").asInt())
                    .put("factMissing", fact == null);
            result.add(line);
        }
        return result;
    }

    @Override
    public JsonNode reserve(RequestContext context, String workOrderId, List<JsonNode> requirements) {
        return store.transaction(context.tenantId(), repository -> {
            String taskId = "production:" + workOrderId;
            List<JsonNode> existing = repository.reservationsByTask(context.tenantId(), taskId);
            if (!existing.isEmpty()) return snapshot(existing);
            List<JsonNode> lines = checkInside(context.tenantId(), requirements);
            if (lines.stream().anyMatch(line -> line.path("factMissing").asBoolean()
                    || new BigDecimal(line.path("shortageQty").asText()).signum() > 0)) {
                throw new ApiException(409, "PRODUCTION_409_MATERIAL_SHORTAGE",
                        "物料不齐套，禁止预留及下达", "补足物料库存后重新检查", java.util.Map.of("materials", lines));
            }
            List<JsonNode> reservations = new ArrayList<>();
            for (JsonNode line : lines) {
                String warehouse = line.path("warehouseId").asText();
                String material = line.path("materialId").asText();
                String qty = line.path("grossRequiredQty").asText();
                JsonNode fact = repository.availability(context.tenantId(), warehouse, material).orElseThrow();
                ObjectNode next = fact.deepCopy();
                next.put("allocatedReservedQty", decimal(number(fact, "allocatedReservedQty").add(new BigDecimal(qty))))
                        .put("fulfillableQty", decimal(number(fact, "fulfillableQty").subtract(new BigDecimal(qty))))
                        .put("factVersion", fact.path("factVersion").asInt() + 1).put("asOf", Instant.now().toString());
                repository.saveAvailability(next);
                ObjectNode reservation = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                        .put("tenantId", context.tenantId()).put("shipmentTaskId", taskId).put("sourceType", "PRODUCTION")
                        .put("workOrderId", workOrderId).put("productId", material).put("warehouseId", warehouse)
                        .put("reservedQty", qty).put("consumedQty", "0").put("uom", line.path("uom").asText())
                        .put("status", "ACTIVE").put("createdAt", Instant.now().toString());
                repository.saveReservation(reservation);
                reservations.add(reservation);
            }
            audit(context, workOrderId, "PRODUCTION_MATERIAL_RESERVE", snapshot(reservations));
            return snapshot(reservations);
        });
    }

    @Override
    public JsonNode consume(RequestContext context, String workOrderId) {
        return store.transaction(context.tenantId(), repository -> {
            List<JsonNode> reservations = repository.reservationsByTask(context.tenantId(), "production:" + workOrderId);
            if (reservations.isEmpty()) throw new ApiException(409, "PRODUCTION_409_KITTING_NOT_READY",
                    "工单没有有效物料预留", "先完成齐套检查");
            for (JsonNode reservation : reservations) {
                if ("CONSUMED".equals(reservation.path("status").asText())) continue;
                if (!"ACTIVE".equals(reservation.path("status").asText())) throw new ApiException(409,
                        "PRODUCTION_409_KITTING_NOT_READY", "物料预留已失效", "重新齐套检查");
                JsonNode fact = repository.availability(context.tenantId(), reservation.path("warehouseId").asText(),
                        reservation.path("productId").asText()).orElseThrow();
                BigDecimal qty = number(reservation, "reservedQty");
                if (number(fact, "qualifiedOnHandQty").compareTo(qty) < 0
                        || number(fact, "allocatedReservedQty").compareTo(qty) < 0) {
                    throw new ApiException(409, "PRODUCTION_409_MATERIAL_SHORTAGE", "预留库存不足", "核对库存后重试");
                }
                ObjectNode next = fact.deepCopy();
                next.put("qualifiedOnHandQty", decimal(number(fact, "qualifiedOnHandQty").subtract(qty)))
                        .put("allocatedReservedQty", decimal(number(fact, "allocatedReservedQty").subtract(qty)))
                        .put("factVersion", fact.path("factVersion").asInt() + 1).put("asOf", Instant.now().toString());
                repository.saveAvailability(next);
                ObjectNode consumed = reservation.deepCopy();
                consumed.put("status", "CONSUMED").put("consumedQty", decimal(qty));
                repository.saveReservation(consumed);
                String id = reservation.path("id").asText();
                repository.addTransaction(mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                        .put("tenantId", context.tenantId()).put("externalTransactionId", "production-material:" + id)
                        .put("transactionNo", "MI-" + id).put("type", "PRODUCTION_MATERIAL_OUTBOUND")
                        .put("warehouseId", reservation.path("warehouseId").asText())
                        .put("productId", reservation.path("productId").asText())
                        .put("qty", decimal(qty)).put("uom", reservation.path("uom").asText())
                        .put("sourceType", "WorkOrder").put("sourceId", workOrderId)
                        .put("traceId", context.traceId()).put("occurredAt", Instant.now().toString()));
            }
            JsonNode result = snapshot(repository.reservationsByTask(context.tenantId(), "production:" + workOrderId));
            audit(context, workOrderId, "PRODUCTION_MATERIAL_CONSUME", result);
            return result;
        });
    }

    private JsonNode snapshot(List<JsonNode> reservations) {
        ObjectNode result = mapper.createObjectNode().put("status", "READY");
        result.set("reservations", mapper.valueToTree(reservations));
        return result;
    }

    private void audit(RequestContext context, String orderId, String action, JsonNode result) {
        ObjectNode audit = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("tenantId", context.tenantId()).put("actorAccountId", context.actorId())
                .put("aggregateType", "WorkOrder").put("aggregateId", orderId).put("action", action)
                .put("traceId", context.traceId()).put("occurredAt", Instant.now().toString());
        audit.set("afterSnapshot", result);
        store.audits.add(audit);
    }

    private static BigDecimal number(JsonNode value, String field) { return new BigDecimal(value.path(field).asText("0")); }
    private static String decimal(BigDecimal value) { return value.stripTrailingZeros().toPlainString(); }
}
