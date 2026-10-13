package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.BiFunction;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class FulfillmentService {
    private static final String SALES_ORDER_SELF_APPROVE_PERMISSION = "sales.order.review.self-approve";

    public record Command(int statusCode, JsonNode body, String etagVersion, boolean replayed) {}

    record EncryptedValue(String ciphertext, String keyId) {}

    private static final BigDecimal SCALE = BigDecimal.valueOf(1_000_000);
    private static final String DECIMAL_PATTERN = "^(0|[1-9]\\d*)(\\.\\d{1,6})?$";
    private static final String POSITIVE_DECIMAL_PATTERN = "^(0|[1-9]\\d*)(\\.\\d{1,6})?$";

    private final FulfillmentStore store;
    private final ObjectMapper mapper;
    private final byte[] dataKey;
    private final String dataKeyId;
    private BiFunction<String, String, java.util.Optional<JsonNode>> productionTaskReader;
    private java.util.function.BiFunction<RequestContext, JsonNode, JsonNode> productionDemandCreator;

    public FulfillmentStore repository() { return store; }

    public void setProductionTaskReader(
            BiFunction<String, String, java.util.Optional<JsonNode>> reader
    ) {
        this.productionTaskReader = reader;
    }

    public void setProductionDemandCreator(
            java.util.function.BiFunction<RequestContext, JsonNode, JsonNode> creator
    ) {
        this.productionDemandCreator = creator;
    }

    public FulfillmentService(FulfillmentStore store, ObjectMapper mapper, String dataKeyId, String encodedDataKey) {
        this.store = store;
        this.mapper = mapper;
        this.dataKeyId = dataKeyId;
        byte[] key;
        try {
            key = Base64.getDecoder().decode(encodedDataKey);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("FULFILLMENT_DATA_KEY must be a base64 encoded 32-byte key");
        }
        if (key.length != 32) {
            throw new IllegalStateException("FULFILLMENT_DATA_KEY must be a base64 encoded 32-byte key");
        }
        this.dataKey = key;
    }

    public Command createOrder(RequestContext context, JsonNode input) {
        require(context, "sales.order.create");
        validateOrder(input, false);
        return command(context, "sales.order.create", input, repository -> {
            requireUniqueLineNumbers(input);
            requireDeliveryDates(input.path("requestedDeliveryDate").asText(), input.withArray("lines"));
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            String correlationId = UUID.randomUUID().toString();
            ObjectNode order = mapper.createObjectNode();
            order.put("id", id).put("tenantId", context.tenantId())
                    .put("orderNo", "SO-" + timestamp.substring(0, 10).replace("-", "") + "-" + id.substring(0, 8).toUpperCase())
                    .put("customerId", text(input, "customerId"));
            copyIfPresent(order, input, "customerName", "ownerEmployeeId", "fulfillmentWarehouseId",
                    "factoryResourceId", "requestedDeliveryDate", "orderDate", "validUntil", "remark");
            order.put("allowPartialShipment", input.path("allowPartialShipment").asBoolean())
                    .put("currency", text(input, "currency"));
            copyIfPresent(order, input, "sourceQuoteId", "sourceQuoteRevision");
            order.set("recipient", recipient(context, id, input.get("recipient")));
            ArrayNode lines = order.putArray("lines");
            for (JsonNode line : input.withArray("lines")) {
                ObjectNode value = line.deepCopy();
                value.put("id", UUID.randomUUID().toString()).put("shippedQty", "0").put("activeRequestedQty", "0")
                        .put("reservedQty", "0").put("remainingQty", text(line, "orderedQty"))
                        .put("lineStatus", "OPEN").put("version", 1);
                lines.add(value);
            }
            setOrderPricing(order, input, lines);
            order.put("overallStatus", "PENDING_CONFIRMATION").put("reviewStatus", "PENDING")
                    .put("shipmentStatus", "NOT_REQUESTED").put("reviewRequired", true)
                    .put("reviewPolicyVersion", "SALES-REVIEW-PILOT-V1")
                    .put("correlationId", correlationId).put("createdBy", context.actorId())
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            repository.saveOrder(order);
            audit(repository, context, "SalesOrder", id, 1, "CREATE", correlationId, null, presentOrder(order), null);
            timeline(repository, "sales.order.created.v1", "SalesOrder", id, order.path("overallStatus").asText(),
                    context, id, "销售订单已创建");
            outbox(repository, context, "sales.order.created.v1", "SalesOrder", id, 1, correlationId,
                    Map.of("salesOrderId", id, "orderNo", text(order, "orderNo"), "reviewStatus", "PENDING"));
            return new Command(201, presentOrder(order), "1", false);
        });
    }

    public Map<String, Object> listOrders(
            RequestContext context, String overallStatus, String reviewStatus, String shipmentStatus,
            String search, int page, int pageSize
    ) {
        require(context, "sales.order.read");
        return store.transaction(context.tenantId(), repository -> {
        List<JsonNode> values = new ArrayList<>(store.orders(context.tenantId()));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "updatedAt")).reversed());
        if (overallStatus != null) values.removeIf(value -> !text(value, "overallStatus").equals(overallStatus));
        if (reviewStatus != null) values.removeIf(value -> !text(value, "reviewStatus").equals(reviewStatus));
        if (shipmentStatus != null) values.removeIf(value -> !text(value, "shipmentStatus").equals(shipmentStatus));
        if (search != null && !search.isBlank()) {
            String query = search.toLowerCase();
            values.removeIf(value -> !(text(value, "orderNo") + " " + text(value, "customerId") + " "
                    + text(value, "customerName")).toLowerCase().contains(query));
        }
        int from = Math.min((page - 1) * pageSize, values.size());
        int to = Math.min(from + pageSize, values.size());
        List<JsonNode> items = values.subList(from, to).stream().map(this::presentOrder).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", values.size());
        result.put("page", page);
        result.put("pageSize", pageSize);
        return result;
        });
    }

    public JsonNode order(RequestContext context, String id) {
        require(context, "sales.order.read");
        return store.transaction(context.tenantId(), repository -> presentOrder(requireOrder(context, id)));
    }

    public Command updateOrder(RequestContext context, String id, JsonNode input) {
        require(context, "sales.order.update");
        if (input == null || input.isEmpty()) {
            throw badRequest("请求体不能为空", List.of(new ApiException.FieldError("body", "必须包含至少一个字段")));
        }
        validateOrderPatch(input);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id);
        commandInput.put("version", requiredVersion(context));
        return command(context, "sales.order.update", commandInput, repository -> {
            JsonNode order = requireOrder(context, id);
            requireVersion(context, version(order));
            requireStatus(order, "overallStatus", "PENDING_CONFIRMATION", "shipmentStatus", "NOT_REQUESTED");
            if (Set.of("REJECTED", "CANCELED").contains(text(order, "reviewStatus"))) {
                throw conflict("当前审批状态不允许编辑订单", "复制为新订单后重新提交审批");
            }
            ObjectNode updated = order.deepCopy();
            copyPatch(updated, input, "customerName", "ownerEmployeeId", "fulfillmentWarehouseId",
                    "factoryResourceId", "requestedDeliveryDate", "orderDate", "validUntil", "remark");
            validateCommercialMetadata(updated);
            if (input.hasNonNull("allowPartialShipment")) {
                updated.put("allowPartialShipment", input.get("allowPartialShipment").asBoolean());
            }
            if (input.hasNonNull("recipient")) {
                updated.set("recipient", recipient(context, id, input.get("recipient")));
            }
            if (input.hasNonNull("lines")) {
                requireUniqueLineNumbers(input);
                requireDeliveryDates(text(updated, "requestedDeliveryDate"), input.withArray("lines"));
                ArrayNode values = mapper.createArrayNode();
                for (JsonNode line : input.withArray("lines")) {
                    JsonNode current = findLine(order, text(line, "lineNo"));
                    ObjectNode value = line.deepCopy();
                    value.put("id", current == null ? UUID.randomUUID().toString() : text(current, "id"))
                            .put("shippedQty", "0").put("activeRequestedQty", "0").put("reservedQty", "0")
                            .put("remainingQty", text(line, "orderedQty")).put("lineStatus", "OPEN")
                            .put("version", (current == null ? 0 : current.path("version").asInt()) + 1);
                    values.add(value);
                }
                Set<String> incoming = numbers(input.withArray("lines"));
                for (JsonNode line : order.withArray("lines")) {
                    if (incoming.contains(text(line, "lineNo"))) continue;
                    ObjectNode value = line.deepCopy();
                    value.put("lineStatus", "CANCELED").put("version", line.path("version").asInt() + 1);
                    values.add(value);
                }
                updated.set("lines", values);
            }
            if (text(order, "reviewRequired").equals("true") && text(order, "reviewStatus").equals("APPROVED")) {
                updated.put("reviewStatus", "PENDING");
            }
            ArrayNode active = mapper.createArrayNode();
            for (JsonNode line : updated.withArray("lines")) {
                if (!text(line, "lineStatus").equals("CANCELED")) active.add(line);
            }
            int nextVersion = version(order) + 1;
            setOrderPricing(updated, input, active);
            updated.put("version", nextVersion).put("updatedAt", now());
            repository.saveOrder(updated);
            audit(repository, context, "SalesOrder", id, nextVersion, "UPDATE", text(order, "correlationId"),
                    presentOrder(order), presentOrder(updated), null);
            timeline(repository, "sales.order.updated.v1", "SalesOrder", id, text(updated, "overallStatus"),
                    context, id, "待确认订单已更新");
            return new Command(200, presentOrder(updated), String.valueOf(nextVersion), false);
        });
    }

    public Command decideReview(RequestContext context, String id, JsonNode input) {
        require(context, "sales.order.review.decide");
        String decision = text(input, "decision");
        if (!Set.of("APPROVE", "RETURN", "REJECT").contains(decision)) {
            throw badRequest("decision 只能是 APPROVE、RETURN 或 REJECT",
                    List.of(new ApiException.FieldError("decision", "Invalid enum value")));
        }
        String comment = optionalText(input, "comment");
        if (comment.length() > 500) {
            throw badRequest("comment 最长 500 字", List.of(new ApiException.FieldError("comment", "too_long")));
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "sales.order.review.decide", commandInput, repository -> {
            JsonNode order = requireOrder(context, id);
            requireVersion(context, version(order));
            if (text(order, "createdBy").equals(context.actorId())
                    && !context.has(SALES_ORDER_SELF_APPROVE_PERMISSION)) {
                throw new ApiException(403, "FULFILLMENT_403_PERMISSION_DENIED", "制单人不能审批自己的订单",
                        "申请 sales.order.review.self-approve 权限，或由其他具备审批权限的人员处理");
            }
            if (!text(order, "reviewStatus").equals("PENDING")) {
                throw conflict("当前审批状态不能执行该决策", "刷新订单状态后重试");
            }
            if (!decision.equals("APPROVE") && comment.isBlank()) {
                throw badRequest("退回或拒绝必须填写原因", List.of(new ApiException.FieldError("comment", "required")));
            }
            String status = decision.equals("APPROVE") ? "APPROVED" : decision.equals("RETURN") ? "RETURNED" : "REJECTED";
            int nextVersion = version(order) + 1;
            ObjectNode updated = nextVersion(order, nextVersion).put("reviewStatus", status);
            repository.saveOrder(updated);
            audit(repository, context, "SalesOrder", id, nextVersion, "REVIEW_" + decision,
                    text(order, "correlationId"), presentOrder(order), presentOrder(updated), comment);
            timeline(repository, "sales.order.review-" + decision.toLowerCase() + ".v1", "SalesOrder", id,
                    status, context, id, comment);
            return new Command(200, presentOrder(updated), String.valueOf(nextVersion), false);
        });
    }

    public Command resubmitReview(RequestContext context, String id, JsonNode input) {
        require(context, "sales.order.review.submit");
        ObjectNode commandInput = input == null ? mapper.createObjectNode() : input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "sales.order.review.submit", commandInput, repository -> {
            JsonNode order = requireOrder(context, id);
            requireVersion(context, version(order));
            if (!text(order, "reviewStatus").equals("RETURNED")) {
                throw conflict("只有已退回订单可以重新提交", "先完成退回内容修改");
            }
            int nextVersion = version(order) + 1;
            ObjectNode updated = nextVersion(order, nextVersion).put("reviewStatus", "PENDING");
            repository.saveOrder(updated);
            String comment = optionalText(input, "comment");
            audit(repository, context, "SalesOrder", id, nextVersion, "REVIEW_RESUBMIT",
                    text(order, "correlationId"), presentOrder(order), presentOrder(updated), comment);
            timeline(repository, "sales.order.review-submitted.v1", "SalesOrder", id, "PENDING",
                    context, id, comment);
            return new Command(200, presentOrder(updated), String.valueOf(nextVersion), false);
        });
    }

    public Command confirmOrder(RequestContext context, String id, JsonNode input) {
        require(context, "sales.order.confirm");
        String requestedDate = text(input, "requestedDeliveryDate");
        if (!requestedDate.matches("\\d{4}-\\d{2}-\\d{2}") || requestedDate.compareTo(today()) < 0) {
            throw badRequest("交期不能早于今天",
                    List.of(new ApiException.FieldError("requestedDeliveryDate", "invalid_date")));
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "sales.order.confirm", commandInput, repository -> {
            JsonNode order = requireOrder(context, id);
            requireVersion(context, version(order));
            if (!Set.of("APPROVED", "NOT_REQUIRED").contains(text(order, "reviewStatus"))
                    || !text(order, "overallStatus").equals("PENDING_CONFIRMATION")
                    || !text(order, "shipmentStatus").equals("NOT_REQUESTED")) {
                throw conflict("订单当前不能重复确认", "刷新订单后从已确认列表继续发货");
            }
            int nextVersion = version(order) + 1;
            ObjectNode updated = nextVersion(order, nextVersion)
                    .put("requestedDeliveryDate", requestedDate).put("overallStatus", "CONFIRMED");
            for (JsonNode line : updated.withArray("lines")) {
                if (text(line, "lineStatus").equals("CANCELED")) continue;
                ObjectNode value = (ObjectNode) line;
                value.put("promisedDate", requestedDate).put("version", line.path("version").asInt() + 1);
            }
            repository.saveOrder(updated);
            audit(repository, context, "SalesOrder", id, nextVersion, "CONFIRM_SHIPMENT_CONTENT",
                    text(order, "correlationId"), presentOrder(order), presentOrder(updated), null);
            timeline(repository, "sales.order.confirmed.v1", "SalesOrder", id, "CONFIRMED", context,
                    id, "销售发货内容已确认，等待发起发货");
            outbox(repository, context, "sales.order.confirmed.v1", "SalesOrder", id, nextVersion,
                    text(order, "correlationId"), Map.of("salesOrderId", id, "orderNo", text(order, "orderNo"),
                            "requestedDeliveryDate", requestedDate));
            return new Command(200, presentOrder(updated), String.valueOf(nextVersion), false);
        });
    }

    public Command cancelOrder(RequestContext context, String id, JsonNode input) {
        require(context, "sales.order.cancel");
        String reason = text(input, "reason");
        if (reason.isBlank() || reason.length() > 500) {
            throw badRequest("reason 必填且最长 500 字", List.of(new ApiException.FieldError("reason", "invalid")));
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "sales.order.cancel", commandInput, repository -> {
            JsonNode order = requireOrder(context, id);
            requireVersion(context, version(order));
            if (!text(order, "overallStatus").equals("PENDING_CONFIRMATION")
                    || !text(order, "shipmentStatus").equals("NOT_REQUESTED")) {
                throw conflict("订单已确认或已移交仓库，不能直接取消", "由仓库走拦截和双人补偿流程");
            }
            int nextVersion = version(order) + 1;
            String timestamp = now();
            ObjectNode updated = nextVersion(order, nextVersion).put("overallStatus", "CANCELED")
                    .put("reviewStatus", "CANCELED").put("cancelReason", reason)
                    .put("canceledAt", timestamp).put("updatedAt", timestamp);
            for (JsonNode line : updated.withArray("lines")) {
                ObjectNode value = (ObjectNode) line;
                value.put("lineStatus", "CANCELED");
            }
            repository.saveOrder(updated);
            audit(repository, context, "SalesOrder", id, nextVersion, "CANCEL", text(order, "correlationId"),
                    presentOrder(order), presentOrder(updated), reason);
            timeline(repository, "sales.order.canceled.v1", "SalesOrder", id, "CANCELED", context,
                    id, reason);
            return new Command(200, presentOrder(updated), String.valueOf(nextVersion), false);
        });
    }

    public Command createShipmentRequest(RequestContext context, String orderId, JsonNode input) {
        require(context, "sales.shipment-request.create");
        if (!input.hasNonNull("warehouseId") || text(input, "warehouseId").length() > 100) {
            throw badRequest("warehouseId 必填且最长 100 字",
                    List.of(new ApiException.FieldError("warehouseId", "invalid")));
        }
        if (input.withArray("lines").isEmpty() || input.withArray("lines").size() > 200) {
            throw badRequest("lines 必须包含 1 到 200 行", List.of(new ApiException.FieldError("lines", "invalid")));
        }
        for (JsonNode line : input.withArray("lines")) {
            if (!text(line, "orderLineId").matches("[0-9a-fA-F-]{36}")) {
                throw badRequest("orderLineId 必须是 UUID", List.of(new ApiException.FieldError("orderLineId", "invalid")));
            }
            if (line.path("sourceLineRevision").asInt(-1) < 1 || !decimalValid(line, "requestedQty")) {
                throw badRequest("发货申请行参数无效", List.of(new ApiException.FieldError("lines", "invalid")));
            }
            requireText(line, "uom", 20, true);
            requireDecimal(line, "requestedQty", true);
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("orderId", orderId).put("version", requiredVersion(context));
        Command result = command(context, "sales.shipment-request.create", commandInput, repository -> {
            JsonNode order = requireOrder(context, orderId);
            requireVersion(context, version(order));
            if (!Set.of("APPROVED", "NOT_REQUIRED").contains(text(order, "reviewStatus"))
                    || !Set.of("CONFIRMED", "PARTIALLY_SHIPPED").contains(text(order, "overallStatus"))) {
                throw conflict("订单尚未完成审批或确认", "确认订单后再发起发货");
            }
            if (!repository.warehouseId(context.tenantId(), text(input, "warehouseId"))
                    .equals(repository.warehouseId(context.tenantId(), text(order, "fulfillmentWarehouseId")))) {
                throw badRequest("发货仓库与订单履约仓库不一致",
                        List.of(new ApiException.FieldError("warehouseId", "warehouse_mismatch")));
            }
            java.util.Set<String> seen = new java.util.HashSet<>();
            String requestId = UUID.randomUUID().toString();
            String timestamp = now();
            ArrayNode requestLines = mapper.createArrayNode();
            for (JsonNode line : input.withArray("lines")) {
                if (!seen.add(text(line, "orderLineId"))) {
                    throw badRequest("同一订单行不能重复申请",
                            List.of(new ApiException.FieldError("lines", "duplicate_order_line")));
                }
                JsonNode source = findLineById(order, text(line, "orderLineId"));
                if (source == null || "CANCELED".equals(text(source, "lineStatus"))) {
                    throw badRequest("发货申请包含无效订单行",
                            List.of(new ApiException.FieldError("lines", "invalid_order_line")));
                }
                if (source.path("version").asInt() != line.path("sourceLineRevision").asInt()
                        || !text(source, "uom").equals(text(line, "uom"))) {
                    throw conflict("订单行版本或单位已变化", "刷新订单后重新发起发货");
                }
                String available = subtract(text(source, "remainingQty"), text(source, "activeRequestedQty"));
                if (compare(text(line, "requestedQty"), available) > 0) {
                    throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                            "申请数量超过订单行剩余可申请量", "减少本次申请数量", null,
                            Map.of("orderLineId", text(source, "id"), "availableToRequest", available));
                }
                ObjectNode value = line.deepCopy();
                value.put("id", UUID.randomUUID().toString()).put("productId", text(source, "productId"))
                        .put("reservedQty", "0").put("postedQty", "0").put("shortageQty", "0");
                requestLines.add(value);
            }
            ObjectNode request = mapper.createObjectNode()
                    .put("id", requestId).put("tenantId", context.tenantId())
                    .put("requestNo", "SR-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + requestId.substring(0, 8).toUpperCase())
                    .put("salesOrderId", orderId)
                    .put("warehouseId", repository.warehouseId(context.tenantId(), text(input, "warehouseId")))
                    .put("orderRevision", version(order)).put("workflowStatus", "REQUESTED")
                    .put("availabilityStatus", "UNCHECKED").put("replenishmentStatus", "NOT_REQUIRED")
                    .put("postingStatus", "NOT_STARTED").put("version", 1)
                    .put("correlationId", text(order, "correlationId"))
                    .put("createdBy", context.actorId()).put("createdAt", timestamp).put("updatedAt", timestamp);
            request.set("lines", requestLines);
            ObjectNode updatedOrder = order.deepCopy();
            updatedOrder.put("shipmentStatus", "REQUESTED").put("version", version(order) + 1)
                    .put("updatedAt", timestamp);
            for (JsonNode orderLine : updatedOrder.withArray("lines")) {
                JsonNode requested = findById(requestLines, text(orderLine, "id"), "orderLineId");
                if (requested != null) {
                    ObjectNode value = (ObjectNode) orderLine;
                    value.put("activeRequestedQty", add(text(orderLine, "activeRequestedQty"),
                            text(requested, "requestedQty")))
                            .put("version", orderLine.path("version").asInt() + 1);
                }
            }
            repository.saveShipmentRequest(request);
            repository.saveOrder(updatedOrder);
            audit(repository, context, "SalesShipmentRequest", requestId, 1, "REQUEST",
                    text(order, "correlationId"), null, request, null);
            timeline(repository, "sales.shipment-request.requested.v1", "SalesShipmentRequest", requestId,
                    "REQUESTED", context, orderId, "销售已移交仓库");
            outbox(repository, context, "sales.shipment-request.requested.v1", "SalesShipmentRequest",
                    requestId, 1, text(order, "correlationId"),
                    Map.of("shipmentRequestId", requestId, "salesOrderId", orderId));
            return new Command(202, request, "1", false);
        });
        drainOutbox(context.tenantId());
        return result;
    }

    public void drainOutbox(String tenantId) {
        for (JsonNode event : store.pendingOutbox(tenantId)) {
            if (!"sales.shipment-request.requested.v1".equals(text(event, "eventType"))) continue;
            try {
                store.transaction(text(event, "tenantId"), repository -> {
                    consumeShipmentRequested(event);
                    repository.markOutboxPublished(text(event, "tenantId"), text(event, "eventId"));
                    return null;
                });
            } catch (RuntimeException exception) {
                store.transaction(text(event, "tenantId"), repository -> {
                    repository.markOutboxFailed(text(event, "tenantId"), text(event, "eventId"));
                    return null;
                });
            }
        }
    }

    public void retryShipmentHandoffs() {
        for (String tenantId : store.pendingOutboxTenantIds()) {
            store.transaction(tenantId, repository -> null);
            drainOutbox(tenantId);
        }
    }

    private void consumeShipmentRequested(JsonNode event) {
        String tenantId = text(event, "tenantId");
        String eventId = text(event, "eventId");
        if (store.hasInbox(tenantId, "inventory-fulfillment", eventId)) return;
        JsonNode request = store.shipmentRequest(tenantId, text(event.path("payload"), "shipmentRequestId")).orElse(null);
        JsonNode order = request == null ? null : store.order(tenantId, text(request, "salesOrderId")).orElse(null);
        if (request == null || order == null) {
            throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "发货申请事件缺少来源聚合",
                    "检查 Outbox 数据完整性后重试", null, Map.of("retryable", true));
        }
        if (store.shipmentTaskByRequest(tenantId, text(request, "id")).isEmpty()) {
            String taskId = UUID.randomUUID().toString();
            ObjectNode task = mapper.createObjectNode().put("id", taskId).put("tenantId", tenantId)
                    .put("shipmentRequestId", text(request, "id")).put("salesOrderId", text(order, "id"))
                    .put("requestNo", text(request, "requestNo")).put("salesOrderNo", text(order, "orderNo"))
                    .put("orderRevision", request.path("orderRevision").asInt())
                    .put("allowPartialShipment", order.path("allowPartialShipment").asBoolean())
                    .put("warehouseId", text(request, "warehouseId"))
                    .put("workflowStatus", "REQUESTED").put("factoryResourceId", text(order, "factoryResourceId"))
                    .put("availabilityStatus", "UNCHECKED").put("replenishmentStatus", "NOT_REQUIRED")
                    .put("postingStatus", "NOT_STARTED").put("version", 1)
                    .put("correlationId", text(order, "correlationId"))
                    .put("createdAt", text(event, "createdAt")).put("updatedAt", now());
            task.set("recipientSnapshot", order.get("recipient").deepCopy());
            ArrayNode lines = task.putArray("lines");
            for (JsonNode line : request.withArray("lines")) {
                JsonNode source = findLineById(order, text(line, "orderLineId"));
                ObjectNode value = line.deepCopy();
                value.put("shipmentRequestLineId", text(line, "id"))
                        .put("allowPartialShipment", order.path("allowPartialShipment").asBoolean()
                                && source != null && source.path("allowPartialShipment").asBoolean());
                if (source != null) value.put("promisedDate", text(source, "promisedDate"));
                lines.add(value);
            }
            store.saveShipmentTask(task);
            ObjectNode timelineValue = mapper.createObjectNode()
                    .put("eventType", "inventory.shipment-task.created.v1")
                    .put("aggregateType", "InventoryShipmentTask").put("aggregateId", taskId)
                    .put("status", "REQUESTED").put("occurredAt", now())
                    .put("traceId", text(event, "traceId")).put("summary", "仓库发货任务已创建");
            store.addTimeline(tenantId, text(order, "id"), timelineValue);
            ObjectNode auditValue = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                    .put("tenantId", tenantId).put("aggregateType", "InventoryShipmentTask")
                    .put("aggregateId", taskId).put("action", "CREATE_FROM_SHIPMENT_REQUEST")
                    .put("actorId", text(request, "createdBy")).put("traceId", text(event, "traceId"))
                    .put("correlationId", text(order, "correlationId")).put("version", 1).put("occurredAt", now());
            store.addAudit(auditValue);
        }
        ObjectNode inbox = mapper.createObjectNode().put("eventId", eventId).put("eventType", text(event, "eventType"));
        store.addInbox(tenantId, "inventory-fulfillment", inbox);
    }

    public Map<String, Object> fulfillmentTrace(RequestContext context, String orderId) {
        require(context, "sales.fulfillment-trace.read");
        return store.transaction(context.tenantId(), repository -> {
        JsonNode order = requireOrder(context, orderId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("salesOrderId", orderId);
        result.put("correlationId", text(order, "correlationId"));
        result.put("events", store.timeline(context.tenantId(), orderId));
        return result;
        });
    }

    public Map<String, Object> receiveAvailability(RequestContext context, JsonNode input) {
        require(context, "inventory.availability.sync");
        return store.transaction(context.tenantId(), repository -> {
            String consumer = "inventory-availability";
            String eventId = text(input, "eventId");
            if (repository.hasInbox(context.tenantId(), consumer, eventId)) {
                return Map.of("duplicate", true, "projectionResult", "DUPLICATE");
            }
            String expected = subtract(subtract(subtract(text(input, "qualifiedOnHandQty"),
                    text(input, "allocatedReservedQty")), text(input, "frozenQty")), text(input, "safetyStockQty"));
            if (compare(expected, "0") < 0) expected = "0";
            if (!expected.equals(text(input, "fulfillableQty"))) {
                throw badRequest("可履约量与冻结公式不一致",
                        List.of(new ApiException.FieldError("fulfillableQty", "formula_mismatch")));
            }
            ObjectNode fact = input.deepCopy();
            fact.put("tenantId", context.tenantId()).put("sourceEventId", eventId)
                    .put("warehouseId", repository.warehouseId(context.tenantId(), text(input, "warehouseId")));
            String projection = repository.saveAvailability(fact);
            ObjectNode inbox = mapper.createObjectNode().put("eventId", eventId)
                    .put("eventType", "inventory.availability.changed.v1");
            repository.addInbox(context.tenantId(), consumer, inbox);
            if (!"STALE".equals(projection)) {
                for (JsonNode taskValue : repository.shipmentTasks(context.tenantId())) {
                    boolean matches = repository.warehouseId(context.tenantId(), text(taskValue, "warehouseId"))
                            .equals(text(fact, "warehouseId"))
                            && "IN_PROGRESS".equals(text(taskValue, "replenishmentStatus"))
                            && streamNodes(taskValue.withArray("lines")).anyMatch(line ->
                                    text(line, "productId").equals(text(input, "productId"))
                                            && compare(text(line, "shortageQty"), "0") > 0);
                    if (!matches) continue;
                    ObjectNode updated = nextVersion(taskValue, version(taskValue) + 1)
                            .put("availabilityStatus", "RECHECKING").put("replenishmentStatus", "AVAILABLE");
                    repository.saveShipmentTask(updated);
                    repository.shipmentRequest(context.tenantId(), text(taskValue, "shipmentRequestId"))
                            .ifPresent(request -> repository.saveShipmentRequest(
                                    nextVersion(request, version(request) + 1)
                                            .put("availabilityStatus", "RECHECKING")
                                            .put("replenishmentStatus", "AVAILABLE")));
                }
            }
            return Map.of("duplicate", false,
                    "projectionResult", "CREATED".equals(projection) ? "INSERTED" : projection);
        });
    }

    public List<JsonNode> availability(RequestContext context, String warehouseId, List<String> productIds) {
        require(context, "inventory.availability.read");
        return store.transaction(context.tenantId(), repository -> {
            String canonicalId = warehouseId == null ? null : repository.warehouseId(context.tenantId(), warehouseId);
            if (canonicalId != null && productIds != null && !productIds.isEmpty()) {
                return productIds.stream().distinct()
                        .map(productId -> repository.availability(context.tenantId(), canonicalId, productId))
                        .flatMap(Optional::stream).toList();
            }
            return repository.availability(context.tenantId()).stream()
                    .filter(fact -> canonicalId == null || canonicalId.equals(text(fact, "warehouseId")))
                    .filter(fact -> productIds == null || productIds.isEmpty() || productIds.contains(text(fact, "productId")))
                    .toList();
        });
    }

    public record CompletionProjection(boolean duplicate, String projectionResult, JsonNode availability) {}

    public CompletionProjection receiveCompletion(RequestContext context, JsonNode input) {
        require(context, "inventory.availability.sync");
        return store.transaction(context.tenantId(), repository -> {
            String eventId = text(input, "eventId");
            if (repository.hasInbox(context.tenantId(), "production-completion", eventId)) {
                return new CompletionProjection(true, "DUPLICATE", null);
            }
            String correlationId = input.hasNonNull("correlationId")
                    ? text(input, "correlationId") : UUID.randomUUID().toString();
            String occurredAt = text(input, "occurredAt");
            String warehouseId = repository.warehouseId(context.tenantId(), text(input, "warehouseId"));
            String productId = text(input, "productId");
            JsonNode current = repository.availability(context.tenantId(), warehouseId, productId).orElse(null);
            if (current != null && !text(current, "uom").equals(text(input, "uom"))) {
                throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED",
                        "完工入库单位与库存事实不一致", "修正生产完工单位或库存物料单位后重试", null,
                        Map.of("inventoryUom", text(current, "uom"), "completionUom", text(input, "uom")));
            }
            ObjectNode transaction = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                    .put("tenantId", context.tenantId()).put("transactionNo", transactionNo())
                    .put("externalTransactionId", text(input, "externalTransactionId"))
                    .put("type", "FG_COMPLETION_INBOUND").put("warehouseId", warehouseId)
                    .put("productId", productId).put("qty", text(input, "qty")).put("uom", text(input, "uom"))
                    .put("sourceType", "ProductionCompletion").put("sourceId", text(input, "completionId"))
                    .put("correlationId", correlationId).put("traceId", context.traceId())
                    .put("occurredAt", occurredAt);
            boolean inserted = repository.addTransaction(transaction);
            JsonNode availability = current;
            if (inserted) {
                int factVersion = Math.max(input.path("inventoryFactVersion").asInt(0),
                        (current == null ? 0 : current.path("factVersion").asInt()) + 1);
                String qualified = add(current == null ? "0" : text(current, "qualifiedOnHandQty"), text(input, "qty"));
                String allocated = current == null ? "0" : text(current, "allocatedReservedQty");
                String frozen = current == null ? "0" : text(current, "frozenQty");
                String safetyStock = current == null ? "0" : text(current, "safetyStockQty");
                String fulfillable = subtract(qualified, add(add(allocated, frozen), safetyStock));
                if (compare(fulfillable, "0") < 0) fulfillable = "0";
                ObjectNode fact = current == null ? mapper.createObjectNode() : current.deepCopy();
                fact.put("tenantId", context.tenantId()).put("warehouseId", warehouseId).put("productId", productId)
                        .put("qualifiedOnHandQty", qualified).put("fulfillableQty", fulfillable)
                        .put("allocatedReservedQty", allocated)
                        .put("frozenQty", frozen)
                        .put("safetyStockQty", safetyStock)
                        .put("inTransitQty", current == null ? "0" : text(current, "inTransitQty"))
                        .put("uom", text(input, "uom")).put("formulaVersion", "FULFILLABLE-V1")
                        .put("factVersion", factVersion).put("sourceSystem", "REFERENCE_WMS")
                        .put("sourceEventId", eventId).put("asOf", occurredAt);
                repository.saveAvailability(fact);
                availability = fact;

                Set<String> demandIds = new java.util.HashSet<>();
                input.withArray("allocations").forEach(value -> demandIds.add(text(value, "demandId")));
                for (JsonNode taskValue : repository.shipmentTasks(context.tenantId())) {
                    boolean matches = repository.warehouseId(context.tenantId(), text(taskValue, "warehouseId")).equals(warehouseId)
                            && "IN_PROGRESS".equals(text(taskValue, "replenishmentStatus"))
                            && streamNodes(taskValue.withArray("lines")).anyMatch(line ->
                                    text(line, "productId").equals(productId)
                                            && !text(line, "productionDemandId").isBlank()
                                            && demandIds.contains(text(line, "productionDemandId")));
                    if (!matches) continue;
                    ObjectNode task = nextVersion(taskValue, version(taskValue) + 1)
                            .put("availabilityStatus", "RECHECKING")
                            .put("replenishmentStatus", "AVAILABLE")
                            .put("inventoryFactVersion", factVersion).put("updatedAt", now());
                    repository.saveShipmentTask(task);
                    repository.shipmentRequest(context.tenantId(), text(task, "shipmentRequestId")).ifPresent(request ->
                            repository.saveShipmentRequest(nextVersion(request, version(request) + 1)
                                    .put("availabilityStatus", "RECHECKING")
                                    .put("replenishmentStatus", "AVAILABLE")
                                    .put("inventoryFactVersion", factVersion).put("updatedAt", now())));
                    timeline(repository, "production.completion.posted.v1", "ProductionCompletion",
                            text(input, "completionId"), "AVAILABLE", context, text(task, "salesOrderId"),
                            "生产完工已入库，等待仓库重新校验");
                }
            }
            ObjectNode inbox = mapper.createObjectNode().put("eventId", eventId)
                    .put("eventType", "production.completion.posted.v1");
            repository.addInbox(context.tenantId(), "production-completion", inbox);
            return new CompletionProjection(!inserted, inserted ? "INSERTED" : "DUPLICATE", availability);
        });
    }

    public Map<String, Object> shipmentTasks(
            RequestContext context, String warehouseId, String workflowStatus, String salesOrderId,
            int page, int pageSize
    ) {
        require(context, "inventory.shipment-task.read");
        return store.transaction(context.tenantId(), repository -> {
        List<JsonNode> values = new ArrayList<>(store.shipmentTasks(context.tenantId()));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "updatedAt")).reversed());
        values.removeIf(value -> warehouseId != null && !text(value, "warehouseId").equals(warehouseId));
        values.removeIf(value -> workflowStatus != null && !text(value, "workflowStatus").equals(workflowStatus));
        values.removeIf(value -> salesOrderId != null && !text(value, "salesOrderId").equals(salesOrderId));
        return pageResult(values.stream().map(this::presentTask).toList(), page, pageSize);
        });
    }

    public JsonNode shipmentTask(RequestContext context, String id) {
        require(context, "inventory.shipment-task.read");
        return store.transaction(context.tenantId(), repository -> {
        JsonNode value = store.shipmentTaskByRequest(context.tenantId(), id)
                .or(() -> shipmentTaskById(context.tenantId(), id))
                .orElseThrow(() -> new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试"));
        return presentTask(value);
        });
    }

    public Command checkAndReserve(RequestContext context, String taskId, JsonNode input) {
        require(context, "inventory.reservation.create");
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("taskId", taskId).put("version", requiredVersion(context));
        return command(context, "inventory.reservation.create", commandInput, repository -> {
            JsonNode sourceTask = shipmentTaskById(context.tenantId(), taskId)
                    .orElseThrow(() -> new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试"));
            requireVersion(context, version(sourceTask));
            if (!text(input, "shipmentRequestId").equals(text(sourceTask, "shipmentRequestId"))
                    || input.path("orderRevision").asInt() != sourceTask.path("orderRevision").asInt()) {
                throw conflict("发货申请或订单版本已变化", "刷新仓库任务后重新校验");
            }
            if (!Set.of("UNCHECKED", "SHORTAGE", "RECHECKING", "PARTIALLY_RESERVED")
                    .contains(text(sourceTask, "availabilityStatus"))) {
                throw conflict("当前任务无需重复预留", "查询既有预留和出库单");
            }
            requireReservableSnapshot(context, sourceTask);
            ObjectNode task = sourceTask.deepCopy();
            String requestedWarehouseId = repository.warehouseId(context.tenantId(), text(input, "warehouseId"));
            task.put("warehouseId", repository.warehouseId(context.tenantId(), text(task, "warehouseId")));
            boolean hasAnyReservation = !repository.reservationsByTask(context.tenantId(), taskId).isEmpty();
            boolean hasPostedQty = streamNodes(task.withArray("lines"))
                    .anyMatch(line -> compare(text(line, "postedQty"), "0") > 0);
            if (!requestedWarehouseId.isBlank() && !requestedWarehouseId.equals(text(task, "warehouseId"))) {
                if (hasAnyReservation || hasPostedQty || !text(task, "outboundId").isBlank()) {
                    throw conflict("任务已有预留或出库记录，不能切换发货仓库", "继续在原发货仓补发，或取消原预留后重新申请");
                }
                JsonNode warehouse = repository.list(context.tenantId(), repository.warehouses).stream()
                        .filter(value -> requestedWarehouseId.equals(text(value, "id")))
                        .findFirst()
                        .orElseThrow(() -> new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                                "发货仓库不存在", "刷新仓库列表后重新选择"));
                if (!"active".equals(text(warehouse, "status"))) {
                    throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                            "发货仓库已停用", "选择启用状态的仓库");
                }
                task.put("warehouseId", requestedWarehouseId);
            }
            for (JsonNode expected : input.withArray("expectedFactVersions")) {
                JsonNode fact = repository.availability(context.tenantId(), text(task, "warehouseId"),
                        text(expected, "productId")).orElse(null);
                if (fact == null || fact.path("factVersion").asInt() != expected.path("factVersion").asInt()) {
                    throw conflict("库存事实版本已变化", "刷新库存事实后重新校验和预留");
                }
            }
            ArrayNode outstanding = mapper.createArrayNode();
            for (JsonNode line : task.withArray("lines")) {
                String requested = subtract(text(line, "requestedQty"), text(line, "reservedQty"));
                if (compare(requested, "0") > 0) {
                    ObjectNode value = (ObjectNode) line.deepCopy();
                    value.put("requestedQty", requested);
                    outstanding.add(value);
                }
            }
            boolean allowPartial = streamNodes(task.withArray("lines"))
                    .allMatch(line -> line.path("allowPartialShipment").asBoolean());
            JsonNode result = referenceReserve(context.tenantId(), text(task, "warehouseId"),
                    context.idempotencyKey(), allowPartial, outstanding);
            if ("PROCESSING_UNKNOWN".equals(text(result, "outcome"))) {
                ObjectNode updated = nextVersion(task, version(task) + 1)
                        .put("workflowStatus", "PROCESSING_UNKNOWN").put("availabilityStatus", "CHECKING");
                repository.saveShipmentTask(updated);
                return processingTask(result, updated);
            }
            if ("REJECTED".equals(text(result, "outcome"))) {
                boolean missingFact = "AVAILABILITY_FACT_MISSING".equals(text(result, "failureCode"));
                String missingProducts = java.util.stream.StreamSupport.stream(
                        result.withArray("missingProductIds").spliterator(), false)
                        .map(JsonNode::asText).collect(java.util.stream.Collectors.joining("、"));
                throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", missingFact
                        ? "所选仓库缺少任务产品库存记录" + (missingProducts.isBlank() ? "" : "：" + missingProducts)
                        : "库存权威源拒绝预留",
                        missingFact ? "为该产品完成入库或选择有库存的仓库后重试"
                                : "检查库存事实和 WMS 映射后使用原业务操作重试", null,
                        Map.of("failureCode", text(result, "failureCode"), "adapterKind", "REFERENCE"));
            }
            String timestamp = now();
            String reservationId = UUID.randomUUID().toString();
            String reservedTotal = streamNodes(result.withArray("lines")).map(line -> text(line, "reservedQty"))
                    .reduce("0", this::add);
            ObjectNode reservation = mapper.createObjectNode().put("id", reservationId)
                    .put("tenantId", context.tenantId()).put("shipmentTaskId", taskId)
                    .put("warehouseId", text(task, "warehouseId"))
                    .put("externalReservationId", text(result, "externalReservationId"))
                    .put("status", "SUCCEEDED".equals(text(result, "outcome")) ? "ACTIVE" : "PARTIAL")
                    .put("factVersion", result.path("factVersion").asInt())
                    .put("formulaVersion", text(result, "formulaVersion")).put("reservedQty", reservedTotal)
                    .put("consumedQty", "0").put("releasedQty", "0")
                    .put("uom", result.withArray("lines").isEmpty() ? "PCS"
                            : text(result.withArray("lines").get(0), "uom"))
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            ArrayNode reservationLines = reservation.putArray("lines");
            for (JsonNode line : result.withArray("lines")) {
                JsonNode taskLine = findLineById(task, text(line, "id"));
                ObjectNode value = mapper.createObjectNode().put("taskLineId", text(line, "id"))
                        .put("orderLineId", text(taskLine, "orderLineId")).put("productId", text(line, "productId"))
                        .put("requestedQty", text(line, "requestedQty")).put("reservedQty", text(line, "reservedQty"))
                        .put("consumedQty", "0").put("releasedQty", "0").put("uom", text(line, "uom"));
                reservationLines.add(value);
            }
            ArrayNode nextLines = task.withArray("lines").deepCopy();
            for (JsonNode line : nextLines) {
                JsonNode decision = findLineById(result, text(line, "id"));
                if (decision != null) {
                    ObjectNode value = (ObjectNode) line;
                    value.put("reservedQty", add(text(line, "reservedQty"), text(decision, "reservedQty")))
                            .put("shortageQty", text(decision, "shortageQty"));
                }
            }
            boolean hasShortage = streamNodes(nextLines).anyMatch(line -> compare(text(line, "shortageQty"), "0") > 0);
            JsonNode existingOutbound = text(task, "outboundId").isBlank() ? null
                    : repository.outbound(context.tenantId(), text(task, "outboundId")).orElse(null);
            String outboundId = existingOutbound == null ? UUID.randomUUID().toString() : text(existingOutbound, "id");
            ObjectNode outbound = mapper.createObjectNode().put("id", outboundId).put("tenantId", context.tenantId())
                    .put("shipmentTaskId", taskId).put("shipmentRequestId", text(task, "shipmentRequestId"))
                    .put("salesOrderId", text(task, "salesOrderId"))
                    .put("outboundNo", "OUT-" + text(task, "requestNo").substring(3))
                    .put("warehouseId", text(task, "warehouseId")).put("status", "RESERVED")
                    .put("version", existingOutbound == null ? 1 : version(existingOutbound) + 1)
                    .put("correlationId", text(task, "correlationId"))
                    .put("createdAt", existingOutbound == null ? timestamp : text(existingOutbound, "createdAt"))
                    .put("updatedAt", timestamp);
            ArrayNode outboundLines = outbound.putArray("lines");
            for (JsonNode line : nextLines) {
                if (compare(text(line, "reservedQty"), "0") <= 0) continue;
                JsonNode oldLine = existingOutbound == null ? null
                        : findById(existingOutbound.withArray("lines"), text(line, "id"), "taskLineId");
                ObjectNode value = mapper.createObjectNode()
                        .put("id", oldLine == null ? UUID.randomUUID().toString() : text(oldLine, "id"))
                        .put("taskLineId", text(line, "id")).put("orderLineId", text(line, "orderLineId"))
                        .put("productId", text(line, "productId")).put("requestedQty", text(line, "requestedQty"))
                        .put("reservedQty", text(line, "reservedQty"))
                        .put("postedQty", oldLine == null ? text(line, "postedQty") : text(oldLine, "postedQty"))
                        .put("uom", text(line, "uom"));
                outboundLines.add(value);
            }
            String availabilityStatus = hasShortage
                    ? (compare(reservedTotal, "0") > 0 ? "PARTIALLY_RESERVED" : "SHORTAGE") : "RESERVED";
            ObjectNode updatedTask = nextVersion(task, version(task) + 1)
                    .put("workflowStatus", "ACTIVE").put("availabilityStatus", availabilityStatus)
                    .put("replenishmentStatus", hasShortage ? "REQUIRED" : "NOT_REQUIRED")
                    .put("inventoryFactVersion", result.path("factVersion").asInt())
                    .put("outboundId", outboundId);
            updatedTask.set("lines", nextLines);
            repository.saveReservation(reservation);
            repository.saveOutbound(outbound);
            repository.saveShipmentTask(updatedTask);
            syncReservationToSales(repository, updatedTask, context);
            audit(repository, context, "InventoryShipmentTask", taskId, version(updatedTask),
                    "CHECK_AND_RESERVE", text(task, "correlationId"), presentTask(task), presentTask(updatedTask), null);
            String eventType = hasShortage ? "inventory.shortage.detected.v1" : "inventory.reservation.created.v1";
            ObjectNode timelineValue = mapper.createObjectNode().put("eventType", eventType)
                    .put("aggregateType", "InventoryShipmentTask").put("aggregateId", taskId)
                    .put("status", availabilityStatus).put("occurredAt", timestamp)
                    .put("traceId", context.traceId())
                    .put("summary", hasShortage ? "库存存在缺口" : "库存预留完成");
            repository.addTimeline(context.tenantId(), text(task, "salesOrderId"), timelineValue);
            outbox(repository, context, eventType, "InventoryShipmentTask", taskId, version(updatedTask),
                    text(task, "correlationId"), Map.of("outboundId", outboundId, "reservationId", reservationId));
            ObjectNode body = mapper.createObjectNode().put("outcome", text(result, "outcome"))
                    .put("result", availabilityStatus).put("adapterKind", "REFERENCE")
                    .put("traceId", context.traceId());
            body.set("missingProductIds", result.withArray("missingProductIds").deepCopy());
            body.set("task", presentTask(updatedTask));
            body.set("shipmentTask", presentTask(updatedTask));
            ArrayNode reservations = body.putArray("reservations").add(reservation);
            body.set("reservation", reservation);
            body.set("outbound", outbound);
            return new Command(200, body, String.valueOf(version(updatedTask)), false);
        });
    }

    public Command createProductionRequest(RequestContext context, String taskId, JsonNode input) {
        require(context, "inventory.production-request.create");
        if (input.withArray("lines").isEmpty() || input.withArray("lines").size() > 200) {
            throw badRequest("lines 必须包含 1 到 200 行",
                    List.of(new ApiException.FieldError("lines", "invalid_count")));
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("taskId", taskId).put("version", requiredVersion(context));
        return command(context, "inventory.production-request.create", commandInput, repository -> {
            JsonNode task = shipmentTaskById(context.tenantId(), taskId).orElse(null);
            if (task == null) {
                throw new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试");
            }
            requireVersion(context, version(task));
            if (!"REQUIRED".equals(text(task, "replenishmentStatus"))) {
                throw conflict("当前任务没有已确认的生产缺口", "先完成权威库存校验");
            }
            JsonNode order = repository.order(context.tenantId(), text(task, "salesOrderId")).orElse(null);
            if (order == null) {
                throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "来源销售订单不存在", "检查关联数据后重试");
            }
            ArrayNode nextLines = task.withArray("lines").deepCopy();
            ArrayNode created = mapper.createArrayNode();
            for (int index = 0; index < nextLines.size(); index++) {
                JsonNode source = nextLines.get(index);
                if (compare(text(source, "shortageQty"), "0") <= 0 || !text(source, "productionDemandId").isBlank()) continue;
                JsonNode requested = streamNodes(input.withArray("lines")).filter(value ->
                        text(value, "shipmentRequestLineId").equals(text(source, "shipmentRequestLineId"))
                                && text(value, "orderLineId").equals(text(source, "orderLineId"))).findFirst().orElse(null);
                if (requested == null) {
                    throw badRequest("缺口行缺少生产申请参数", List.of(new ApiException.FieldError("lines", "missing_request")));
                }
                String factoryResourceId = text(requested, "factoryResourceId").isBlank()
                        ? text(task, "factoryResourceId").isBlank() ? text(order, "factoryResourceId")
                                : text(task, "factoryResourceId") : text(requested, "factoryResourceId");
                String dueDate = !text(source, "promisedDate").isBlank() ? text(source, "promisedDate")
                        : !text(requested, "dueDate").isBlank() ? text(requested, "dueDate")
                                : text(order, "requestedDeliveryDate");
                int sourceRevision = requested.path("sourceRevision").asInt(
                        source.path("sourceLineRevision").asInt(1));
                if (factoryResourceId.isBlank()) {
                    throw badRequest("缺口行缺少工厂资源", List.of(new ApiException.FieldError("factoryResourceId", "required")));
                }
                if (dueDate.isBlank()) {
                    throw badRequest("缺口行缺少需求日期", List.of(new ApiException.FieldError("dueDate", "required")));
                }
                ObjectNode demandInput = mapper.createObjectNode()
                        .put("sourceType", "SALES_ORDER_SHORTAGE").put("sourceSystem", "INVENTORY_FULFILLMENT")
                        .put("sourceId", text(task, "salesOrderId")).put("sourceLineId", text(source, "orderLineId"))
                        .put("productId", text(source, "productId")).put("qty", text(source, "shortageQty"))
                        .put("uom", text(source, "uom")).put("dueDate", dueDate)
                        .put("factoryResourceId", factoryResourceId).put("sourceRevision", sourceRevision)
                        .put("correlationId", text(task, "correlationId"));
                ObjectNode snapshot = demandInput.putObject("payloadSnapshot");
                snapshot.put("shipmentRequestId", text(task, "shipmentRequestId"))
                        .put("shipmentRequestLineId", text(source, "shipmentRequestLineId"))
                        .put("salesOrderId", text(task, "salesOrderId")).put("salesOrderLineId", text(source, "orderLineId"))
                        .put("warehouseId", text(task, "warehouseId")).put("inventoryFactVersion", task.path("inventoryFactVersion").asInt())
                        .put("correlationId", text(task, "correlationId")).put("traceId", context.traceId());
                if (productionDemandCreator == null) {
                    throw new ApiException(503, "PRODUCTION_503_SERVICE_UNAVAILABLE", "生产需求服务不可用", "稍后使用同一幂等键重试");
                }
                JsonNode demand = productionDemandCreator.apply(context, demandInput);
                created.add(demand.deepCopy());
                ObjectNode line = (ObjectNode) source;
                line.put("productionDemandId", text(demand, "id"));
                nextLines.set(index, line);
            }
            String timestamp = now();
            ObjectNode updatedTask = nextVersion(task, version(task) + 1)
                    .put("replenishmentStatus", "IN_PROGRESS").put("updatedAt", timestamp);
            updatedTask.set("lines", nextLines);
            repository.saveShipmentTask(updatedTask);
            repository.shipmentRequest(context.tenantId(), text(task, "shipmentRequestId")).ifPresent(requestValue -> {
                ObjectNode request = nextVersion(requestValue, version(requestValue) + 1)
                        .put("replenishmentStatus", "IN_PROGRESS").put("updatedAt", timestamp);
                ArrayNode requestLines = request.withArray("lines");
                for (JsonNode line : requestLines) {
                    JsonNode taskLine = findById(nextLines, text(line, "id"), "shipmentRequestLineId");
                    if (taskLine != null && taskLine.hasNonNull("productionDemandId")) {
                        ((ObjectNode) line).put("productionDemandId", text(taskLine, "productionDemandId"));
                    }
                }
                repository.saveShipmentRequest(request);
            });
            ObjectNode updatedOrder = nextVersion(order, version(order) + 1)
                    .put("overallStatus", "REPLENISHING").put("updatedAt", timestamp);
            repository.saveOrder(updatedOrder);
            audit(repository, context, "InventoryShipmentTask", taskId, version(updatedTask),
                    "CREATE_PRODUCTION_REQUEST", text(task, "correlationId"), presentTask(task), presentTask(updatedTask), null);
            timeline(repository, "production.demand.created.v1", "InventoryShipmentTask", taskId, "IN_PROGRESS",
                    context, text(task, "salesOrderId"), "缺口已转生产补货");
            for (JsonNode demand : created) {
                String demandId = text(demand, "id");
                JsonNode line = streamNodes(nextLines).filter(value -> demandId.equals(text(value, "productionDemandId")))
                        .findFirst().orElseThrow();
                outbox(repository, context, "production.demand.created.v1", "ProductionDemand", demandId, 1,
                        text(task, "correlationId"), Map.of(
                                "demandId", demandId, "demandCode", text(demand, "code"),
                                "shipmentRequestId", text(task, "shipmentRequestId"),
                                "requestLineId", text(line, "shipmentRequestLineId"),
                                "salesOrderId", text(task, "salesOrderId"), "orderLineId", text(line, "orderLineId"),
                                "productId", text(line, "productId"), "shortageQty", text(line, "shortageQty"),
                                "uom", text(line, "uom"), "status", "RECEIVED"));
            }
            ArrayNode links = mapper.createArrayNode();
            for (JsonNode line : nextLines) {
                if (text(line, "productionDemandId").isBlank()) continue;
                JsonNode demand = findById(created, text(line, "productionDemandId"));
                ObjectNode link = links.addObject();
                link.put("shipmentRequestLineId", text(line, "shipmentRequestLineId"))
                        .put("orderLineId", text(line, "orderLineId"))
                        .put("demandId", text(line, "productionDemandId"))
                        .put("demandCode", demand == null ? text(line, "productionDemandId") : text(demand, "code"))
                        .put("sourceRevision", line.path("sourceLineRevision").asInt(1))
                        .put("shortageQty", text(line, "shortageQty")).put("uom", text(line, "uom"));
            }
            ObjectNode body = mapper.createObjectNode().set("task", presentTask(updatedTask));
            body.set("shipmentTask", presentTask(updatedTask));
            body.set("demands", created);
            body.set("links", links);
            body.put("restored", created.isEmpty()).put("recovered", created.isEmpty())
                    .put("traceId", context.traceId());
            return new Command(created.isEmpty() ? 200 : 201, body, String.valueOf(version(updatedTask)), false);
        });
    }

    public JsonNode reservation(RequestContext context, String id) {
        require(context, "inventory.outbound.read");
        return store.reservation(context.tenantId(), id).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "库存预留不存在", "刷新任务详情后重试"));
    }

    public Command releaseReservation(RequestContext context, String id, JsonNode input) {
        require(context, "inventory.reservation.release");
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "inventory.reservation.release", commandInput, repository -> {
            JsonNode value = repository.reservation(context.tenantId(), id).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "库存预留不存在", "刷新任务详情后重试"));
            requireVersion(context, version(value));
            ArrayNode releaseLines = mapper.createArrayNode();
            for (JsonNode line : value.withArray("lines")) {
                String releasable = subtract(text(line, "reservedQty"),
                        add(text(line, "consumedQty"), text(line, "releasedQty")));
                if (compare(releasable, "0") > 0) {
                    ObjectNode item = mapper.createObjectNode().put("lineId", text(line, "taskLineId"))
                            .put("productId", text(line, "productId")).put("qty", releasable)
                            .put("uom", text(line, "uom"));
                    releaseLines.add(item);
                }
            }
            JsonNode result = referencePost(context.tenantId(), "REL", context.idempotencyKey(), "SUCCEEDED", releaseLines);
            String releasedQty = streamNodes(releaseLines).map(line -> text(line, "qty")).reduce("0", this::add);
            ObjectNode updated = nextVersion(value, version(value) + 1).put("status", "RELEASED")
                    .put("releasedQty", add(text(value, "releasedQty"), releasedQty));
            ArrayNode updatedLines = updated.withArray("lines");
            for (JsonNode line : updatedLines) {
                ObjectNode item = (ObjectNode) line;
                item.put("releasedQty", subtract(text(line, "reservedQty"), text(line, "consumedQty")));
            }
            repository.saveReservation(updated);
            audit(repository, context, "InventoryReservation", id, version(updated), "RELEASE",
                    UUID.randomUUID().toString(), value, updated, text(input, "reason"));
            for (JsonNode line : releaseLines) {
                addTransactionRecord(repository, context, "RESERVATION_RELEASE", text(value, "warehouseId"),
                        text(line, "productId"), text(line, "qty"), text(line, "uom"), "InventoryReservation", id,
                        text(line, "lineId"), value.path("factVersion").asInt(), now());
            }
            outbox(repository, context, "inventory.reservation.released.v1", "InventoryReservation", id,
                    version(updated), UUID.randomUUID().toString(),
                    Map.of("reservationId", id, "reason", text(input, "reason"),
                            "compensationId", text(input, "compensationId")));
            return new Command(200, updated, String.valueOf(version(updated)), false);
        });
    }

    public JsonNode outbound(RequestContext context, String id) {
        require(context, "inventory.outbound.read");
        return store.transaction(context.tenantId(), repository -> store.outbound(context.tenantId(), id).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "销售出库单不存在", "刷新任务详情后重试")));
    }

    public Command postOutbound(RequestContext context, String id, JsonNode input) {
        require(context, "inventory.outbound.post");
        requirePostInput(input);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "inventory.outbound.post", commandInput, repository -> {
            JsonNode value = repository.outbound(context.tenantId(), id).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "销售出库单不存在", "刷新任务详情后重试"));
            requireVersion(context, version(value));
            if (!Set.of("RESERVED", "PARTIALLY_POSTED").contains(text(value, "status"))) {
                throw conflict("出库单当前不能发货", "刷新出库单并核对未消费的预留");
            }
            JsonNode task = shipmentTaskById(context.tenantId(), text(value, "shipmentTaskId")).orElseThrow(() ->
                    new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "出库单缺少仓库任务", "修复来源关联后重试"));
            requireReservableSnapshot(context, task);
            ArrayNode postLines = mapper.createArrayNode();
            for (JsonNode line : input.withArray("lines")) {
                JsonNode source = findLineById(value, text(line, "outboundLineId"));
                if (source == null || !text(source, "uom").equals(text(line, "uom"))) {
                    throw badRequest("出库行与预留不一致", List.of(new ApiException.FieldError("lines", "invalid")));
                }
                String remaining = subtract(text(source, "reservedQty"), text(source, "postedQty"));
                if (compare(text(line, "qty"), remaining) > 0) {
                    throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION", "出库数量超过未消费预留",
                            "减少出库数量", null, Map.of("outboundLineId", text(line, "outboundLineId"),
                                    "remaining", remaining));
                }
                ObjectNode item = mapper.createObjectNode().put("lineId", text(source, "id"))
                        .put("productId", text(source, "productId")).put("qty", text(line, "qty"))
                        .put("uom", text(line, "uom"));
                postLines.add(item);
            }
            if (!task.path("allowPartialShipment").asBoolean()
                    || streamNodes(task.withArray("lines")).anyMatch(line -> !line.path("allowPartialShipment").asBoolean())) {
                for (JsonNode line : task.withArray("lines")) {
                    JsonNode outboundLine = findById(value.withArray("lines"), text(line, "id"), "taskLineId");
                    JsonNode posted = outboundLine == null ? null
                            : findById(postLines, text(outboundLine, "id"), "lineId");
                    String qty = posted == null ? "0" : text(posted, "qty");
                    if (compare(qty, subtract(text(line, "requestedQty"), text(line, "postedQty"))) != 0) {
                        throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                                "订单不允许部分发货", "按本次申请全量发货");
                    }
                }
            }
            String postingKey = requiredIdempotency(context);
            JsonNode result = referencePost(context.tenantId(), "OUT", postingKey, "SUCCEEDED", postLines);
            String postedAt = text(input, "shippedAt");
            ObjectNode updated = nextVersion(value, version(value) + 1).put("postingKey", postingKey)
                    .put("updatedAt", postedAt).put("postedAt", postedAt);
            ArrayNode outboundLines = updated.withArray("lines");
            for (JsonNode line : outboundLines) {
                JsonNode posted = findById(result.withArray("lines"), text(line, "id"), "lineId");
                if (posted != null) {
                    ObjectNode item = (ObjectNode) line;
                    item.put("postedQty", add(text(line, "postedQty"), text(posted, "postedQty")));
                }
            }
            boolean fullyPosted = streamNodes(outboundLines).allMatch(line ->
                    compare(text(line, "postedQty"), text(line, "reservedQty")) == 0);
            updated.put("status", fullyPosted ? "POSTED" : "PARTIALLY_POSTED");
            repository.saveOutbound(updated);
            audit(repository, context, "SalesOutbound", id, version(updated), "POST",
                    text(value, "correlationId"), value, updated, null);
            ArrayNode transactions = mapper.createArrayNode();
            int transactionIndex = 0;
            for (JsonNode line : result.withArray("lines")) {
                if (compare(text(line, "postedQty"), "0") > 0) {
                    int factVersion = repository.availability(context.tenantId(), text(value, "warehouseId"),
                            text(line, "productId")).map(fact -> fact.path("factVersion").asInt() + 1).orElse(0);
                    ObjectNode saved = (ObjectNode) manualTransaction(context, "SALES_OUTBOUND",
                            text(value, "warehouseId"), text(line, "productId"), text(line, "postedQty"),
                            text(line, "uom"), "SalesOutbound", id,
                            result.path("externalTransactionIds").get(transactionIndex).asText(),
                            String.valueOf(factVersion), text(value, "correlationId"), postedAt);
                    saved.put("sourceLineId", text(line, "lineId"));
                    repository.addTransaction(saved);
                    transactions.add(saved);
                }
                transactionIndex++;
            }
            ArrayNode postedByOrderLine = mapper.createArrayNode();
            for (JsonNode line : result.withArray("lines")) {
                JsonNode outboundLine = findLineById(value, text(line, "lineId"));
                if (outboundLine == null) continue;
                ObjectNode item = mapper.createObjectNode().put("orderLineId", text(outboundLine, "orderLineId"))
                        .put("postedQty", text(line, "postedQty"));
                postedByOrderLine.add(item);
            }
            Map<String, String> postedByProduct = new LinkedHashMap<>();
            result.withArray("lines").forEach(line -> postedByProduct.merge(
                    text(line, "productId"), text(line, "postedQty"), this::add));
            for (Map.Entry<String, String> entry : postedByProduct.entrySet()) {
                JsonNode current = repository.availability(context.tenantId(), text(value, "warehouseId"),
                        entry.getKey()).orElse(null);
                if (current == null || streamNodes(value.withArray("lines")).filter(line -> entry.getKey().equals(text(line, "productId")))
                        .anyMatch(line -> !text(current, "uom").equals(text(line, "uom")))) {
                    throw conflict("库存事实缺失或单位不一致", "刷新库存事实并检查产品单位");
                }
                String qualified = subtract(text(current, "qualifiedOnHandQty"), entry.getValue());
                String allocated = subtract(text(current, "allocatedReservedQty"), entry.getValue());
                if (compare(qualified, "0") < 0 || compare(allocated, "0") < 0) {
                    throw conflict("库存现存量与预留消费不一致", "刷新库存事实并检查未完成出库");
                }
                ObjectNode fact = current.deepCopy();
                fact.put("qualifiedOnHandQty", qualified).put("allocatedReservedQty", allocated)
                        .put("factVersion", current.path("factVersion").asInt() + 1)
                        .put("sourceEventId", UUID.randomUUID().toString())
                        .put("sourceSystem", "REFERENCE_WMS").put("asOf", postedAt);
                repository.saveAvailability(fact);
            }
            applyOutboundToTaskAndSales(repository, updated, postedByOrderLine, context);
            JsonNode updatedOrder = repository.order(context.tenantId(), text(value, "salesOrderId")).orElseThrow();
            ArrayNode eventLines = mapper.createArrayNode();
            for (JsonNode posted : postedByOrderLine) {
                JsonNode orderLine = findLineById(updatedOrder, text(posted, "orderLineId"));
                eventLines.addObject().put("orderLineId", text(posted, "orderLineId"))
                        .put("postedQty", text(posted, "postedQty")).put("cumulativePostedQty", text(orderLine, "shippedQty"))
                        .put("remainingQty", text(orderLine, "remainingQty")).put("uom", text(orderLine, "uom"));
            }
            outbox(repository, context, fullyPosted ? "inventory.sales-outbound.posted.v1"
                            : "inventory.sales-outbound.partially-posted.v1", "SalesOutbound", id,
                    version(updated), text(value, "correlationId"),
                    Map.of("outboundId", id, "externalTransactionIds", result.path("externalTransactionIds"),
                            "shipmentRequestId", text(value, "shipmentRequestId"), "salesOrderId", text(value, "salesOrderId"),
                            "postedAt", postedAt, "lines", eventLines));
            ObjectNode body = mapper.createObjectNode().put("outcome", text(result, "outcome"))
                    .put("result", text(updated, "status")).put("adapterKind", "REFERENCE")
                    .put("traceId", context.traceId());
            body.set("outbound", updated);
            body.set("transactions", transactions);
            body.set("task", presentTask(shipmentTaskById(context.tenantId(), text(value, "shipmentTaskId")).orElseThrow()));
            body.set("order", presentOrder(repository.order(context.tenantId(), text(value, "salesOrderId")).orElseThrow()));
            ArrayNode externalIds = body.putArray("externalTransactionIds");
            result.withArray("externalTransactionIds").forEach(externalIds::add);
            return new Command(200, body, String.valueOf(version(updated)), false);
        });
    }

    public Map<String, Object> transactions(
            RequestContext context, String warehouseId, String productId, String sourceId, String type,
            int page, int pageSize
    ) {
        require(context, "inventory.transaction.read");
        List<JsonNode> values = new ArrayList<>(store.transactions(context.tenantId()));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "occurredAt")).reversed());
        values.removeIf(value -> warehouseId != null && !text(value, "warehouseId").equals(warehouseId));
        values.removeIf(value -> productId != null && !text(value, "productId").equals(productId));
        values.removeIf(value -> sourceId != null && !text(value, "sourceId").equals(sourceId));
        values.removeIf(value -> type != null && !text(value, "type").equals(type));
        return pageResult(values, page, pageSize);
    }

    public Object queryWmsResult(
            RequestContext context, String kind, String idempotencyKey
    ) {
        require(context, "inventory.reservation.read");
        JsonNode result = store.get(context.tenantId(), kind + ":" + idempotencyKey, store.wmsResults).orElse(null);
        if (result == null) {
            return Map.of("status", "PROCESSING_UNKNOWN", "message", "WMS 结果尚未返回");
        }
        return Map.of("result", result.deepCopy());
    }

    public Map<String, Object> masterList(RequestContext context, Map<String, JsonNode> source, String permission) {
        require(context, permission);
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), source));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "updatedAt")).reversed());
        return listResult(values);
    }

    public JsonNode masterGet(
            RequestContext context, String id, Map<String, JsonNode> source, String permission, String label
    ) {
        require(context, permission);
        return store.get(context.tenantId(), id, source).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", label + "不存在", "刷新列表后重试"));
    }

    public Command createMaster(
            RequestContext context, JsonNode input, Map<String, JsonNode> source, String commandType,
            String permission, String aggregateType
    ) {
        require(context, permission);
        requireText(input, "code", 50, true);
        requireText(input, "name", 200, true);
        return command(context, commandType, input, repository -> {
            if (repository.getByCode(context.tenantId(), text(input, "code"), source).isPresent()) {
                throw conflict("编码已存在", "使用不同编码");
            }
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode value = mapper.createObjectNode().put("id", id).put("tenantId", context.tenantId())
                    .put("code", text(input, "code")).put("name", text(input, "name"))
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            for (String field : new String[]{"specification", "category", "address", "manager", "phone",
                    "organization", "capacity", "usedCapacity",
                    "unitPrice", "remark", "productCode", "productName"}) {
                copyIfPresent(value, input, field);
            }
            if ("Warehouse".equals(aggregateType)) {
                value.put("type", text(input, "type", "standard"))
                        .put("status", text(input, "status", "active"));
            } else if ("Product".equals(aggregateType)) {
                value.put("uom", text(input, "uom", "PCS")).put("unitWeight", "0").put("unitVolume", "0")
                        .put("unitPrice", text(input, "unitPrice", "0"))
                        .put("safetyStockQty", text(input, "safetyStockQty", "0"))
                        .put("maxStockQty", text(input, "maxStockQty", "0"))
                        .put("productType", text(input, "productType", "finished")).put("status", "active");
            } else if ("Material".equals(aggregateType)) {
                value.put("uom", text(input, "uom", "PCS")).put("unitWeight", "0")
                        .put("unitPrice", text(input, "unitPrice", "0"))
                        .put("safetyStockQty", text(input, "safetyStockQty", "0"))
                        .put("maxStockQty", text(input, "maxStockQty", "0"))
                        .put("materialType", text(input, "materialType", "purchased")).put("status", "active");
            }
            repository.put(context.tenantId(), id, value, source);
            audit(repository, context, aggregateType, id, 1, "CREATE", UUID.randomUUID().toString(), null, value, null);
            return new Command(201, wrapper(aggregateType, value), "1", false);
        });
    }

    public Command updateMaster(
            RequestContext context, String id, JsonNode input, Map<String, JsonNode> source,
            String commandType, String permission, String aggregateType, Set<String> allowed
    ) {
        require(context, permission);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, commandType, commandInput, repository -> {
            JsonNode current = repository.get(context.tenantId(), id, source).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", aggregateType + "不存在", "刷新列表后重试"));
            requireVersion(context, version(current));
        if ("Warehouse".equals(aggregateType)) {
            for (String field : new String[]{"capacity", "usedCapacity"}) {
                if (input.hasNonNull(field)) requireDecimal(input, field, false);
            }
        }
            ObjectNode updated = current.deepCopy();
            for (String field : allowed) {
                if (!input.hasNonNull(field)) continue;
                if (field.endsWith("Qty") || field.equals("unitPrice")
                        || field.equals("unitWeight") || field.equals("unitVolume")) {
                    requireDecimal(input, field, false);
                }
                if (field.equals("unitPrice") && new BigDecimal(input.get(field).asText()).compareTo(BigDecimal.ZERO) < 0) {
                    throw badRequest("unitPrice 不能小于 0",
                            List.of(new ApiException.FieldError(field, "negative_decimal")));
                }
                updated.set(field, input.get(field).deepCopy());
            }
            int next = version(current) + 1;
            updated.put("version", next).put("updatedAt", now());
            repository.put(context.tenantId(), id, updated, source);
            audit(repository, context, aggregateType, id, next, "UPDATE", UUID.randomUUID().toString(),
                    current, updated, null);
            return new Command(200, wrapper(aggregateType, updated), String.valueOf(next), false);
        });
    }

    public Command deleteMaster(
            RequestContext context, String id, Map<String, JsonNode> source, String permission, String aggregateType
    ) {
        require(context, permission);
        return command(context, aggregateType.toLowerCase() + ".delete",
                mapper.createObjectNode().put("id", id), repository -> {
                    JsonNode current = repository.get(context.tenantId(), id, source).orElseThrow(() ->
                            new ApiException(404, "FULFILLMENT_404_NOT_FOUND", aggregateType + "不存在", "刷新列表后重试"));
                    requireVersion(context, version(current));
            if ("Warehouse".equals(aggregateType)) {
                boolean referenced = repository.availability(context.tenantId()).stream().anyMatch(value ->
                        text(value, "warehouseId").equals(id))
                        || repository.list(context.tenantId(), repository.products).stream().anyMatch(value ->
                                text(value, "defaultWarehouseId").equals(id) || text(value, "warehouseId").equals(id))
                        || repository.list(context.tenantId(), repository.materials).stream().anyMatch(value ->
                                text(value, "defaultWarehouseId").equals(id) || text(value, "warehouseId").equals(id))
                        || repository.list(context.tenantId(), repository.transferOrders).stream().anyMatch(value ->
                                text(value, "fromWarehouseId").equals(id) || text(value, "toWarehouseId").equals(id))
                        || repository.shipmentTasks(context.tenantId()).stream().anyMatch(value ->
                                text(value, "warehouseId").equals(id))
                        || repository.list(context.tenantId(), repository.stocktakeTasks).stream().anyMatch(value ->
                                text(value, "warehouseId").equals(id));
                if (referenced) {
                    throw conflict("仓库已被库存或业务单据引用", "先处理关联库存/单据，或将仓库停用");
                }
            }
                    repository.remove(context.tenantId(), id, source);
                    audit(repository, context, aggregateType, id, version(current), "DELETE",
                            UUID.randomUUID().toString(), current, null, null);
                    return new Command(200, mapper.createObjectNode().put("deleted", true), null, false);
                });
    }

    public Map<String, Object> transferOrders(RequestContext context) {
        require(context, "inventory.transfer.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.transferOrders));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "createdAt")).reversed());
        return listResult(values);
    }

    public JsonNode transferOrder(RequestContext context, String id) {
        require(context, "inventory.transfer.read");
        return store.get(context.tenantId(), id, store.transferOrders).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "调拨单不存在", "刷新调拨单列表后重试"));
    }

    public Command createTransferOrder(RequestContext context, JsonNode input) {
        require(context, "inventory.transfer.create");
        requireText(input, "fromWarehouseId", 100, true);
        requireText(input, "toWarehouseId", 100, true);
        requireText(input, "productId", 100, true);
        requireDecimal(input, "transferQty", true);
        requireText(input, "uom", 20, true);
        if (text(input, "fromWarehouseId").equals(text(input, "toWarehouseId"))) {
            throw badRequest("源仓库和目标仓库不能相同",
                    List.of(new ApiException.FieldError("toWarehouseId", "same_warehouse")));
        }
        return command(context, "inventory.transfer.create", input, repository -> {
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode line = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                    .put("productId", text(input, "productId"))
                    .put("productCode", text(input, "productCode"))
                    .put("productName", text(input, "productName"))
                    .put("transferQty", text(input, "transferQty")).put("receivedQty", "0")
                    .put("uom", text(input, "uom")).put("version", 1);
            ObjectNode value = mapper.createObjectNode().put("id", id).put("tenantId", context.tenantId())
                    .put("transferNo", "TR-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + id.substring(0, 8).toUpperCase())
                    .put("fromWarehouseId", text(input, "fromWarehouseId"))
                    .put("toWarehouseId", text(input, "toWarehouseId")).put("productId", text(input, "productId"))
                    .put("productCode", text(input, "productCode"))
                    .put("productName", text(input, "productName"))
                    .put("transferQty", text(input, "transferQty")).put("receivedQty", "0")
                    .put("uom", text(input, "uom")).put("status", "DRAFT").put("reason", text(input, "reason"))
                    .put("correlationId", UUID.randomUUID().toString()).put("createdBy", context.actorId())
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            value.putArray("lines").add(line);
            repository.put(context.tenantId(), id, value, store.transferOrders);
            audit(repository, context, "TransferOrder", id, 1, "CREATE", text(value, "correlationId"), null, value, null);
            return new Command(201, wrapper("TransferOrder", value), "1", false);
        });
    }

    public Command transferAction(
            RequestContext context, String id, String action, JsonNode input
    ) {
        String permission = switch (action) {
            case "APPROVE" -> "inventory.transfer.approve";
            case "SHIP" -> "inventory.transfer.ship";
            case "RECEIVE" -> "inventory.transfer.receive";
            default -> "inventory.transfer.cancel";
        };
        require(context, permission);
        ObjectNode commandInput = input == null ? mapper.createObjectNode() : input.deepCopy();
        commandInput.put("id", id);
        return command(context, "inventory.transfer." + action.toLowerCase(), commandInput, repository -> {
            JsonNode order = repository.get(context.tenantId(), id, store.transferOrders).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "调拨单不存在", "刷新调拨单列表后重试"));
            requireVersion(context, version(order));
            String timestamp = now();
            ObjectNode updated;
            JsonNode availability = null;
            JsonNode transaction = null;
            if ("APPROVE".equals(action)) {
                if (!Set.of("DRAFT", "PENDING_APPROVAL").contains(text(order, "status"))) {
                    throw conflict("调拨单当前状态不可审批", "刷新调拨单后重试");
                }
                updated = nextVersion(order, version(order) + 1).put("status", "APPROVED")
                        .put("approvedBy", context.actorId()).put("approvedAt", timestamp);
            } else if ("SHIP".equals(action)) {
                if (!"APPROVED".equals(text(order, "status"))) {
                    throw conflict("调拨单当前状态不可发货", "刷新调拨单后重试");
                }
                JsonNode fact = repository.availability(context.tenantId(), text(order, "fromWarehouseId"),
                        text(order, "productId")).orElseThrow(() -> new ApiException(404,
                        "FULFILLMENT_404_NOT_FOUND", "源仓库库存事实不存在", "确认源仓库有库存后重试"));
                if (compare(text(fact, "fulfillableQty"), text(order, "transferQty")) < 0) {
                    throw conflict("源仓库可履约量不足", "确认库存后调整调拨数量");
                }
                ObjectNode newFact = fact.deepCopy();
                newFact.put("qualifiedOnHandQty", subtract(text(fact, "qualifiedOnHandQty"), text(order, "transferQty")))
                        .put("fulfillableQty", subtract(text(fact, "fulfillableQty"), text(order, "transferQty")))
                        .put("factVersion", fact.path("factVersion").asInt() + 1)
                        .put("sourceEventId", UUID.randomUUID().toString()).put("sourceSystem", "REFERENCE_WMS")
                        .put("asOf", timestamp);
                repository.saveAvailability(newFact);
                transaction = addTransactionRecord(repository, context, "TRANSFER_OUTBOUND",
                        text(order, "fromWarehouseId"), text(order, "productId"), text(order, "transferQty"),
                        text(order, "uom"), "TransferOrder", id, null, newFact.path("factVersion").asInt(), timestamp);
                updated = nextVersion(order, version(order) + 1).put("status", "IN_TRANSIT")
                        .put("shippedAt", timestamp).put("externalTransactionId", text(input, "externalTransactionId"));
                availability = newFact;
                outbox(repository, context, "inventory.transfer.shipped.v1", "TransferOrder", id,
                        version(updated), UUID.randomUUID().toString(), Map.of("transferId", id));
            } else if ("RECEIVE".equals(action)) {
                if (!Set.of("IN_TRANSIT", "SHIPPING").contains(text(order, "status"))) {
                    throw conflict("调拨单当前状态不可收货", "刷新调拨单后重试");
                }
                JsonNode current = repository.availability(context.tenantId(), text(order, "toWarehouseId"),
                        text(order, "productId")).orElse(null);
                ObjectNode newFact;
                if (current == null) {
                    newFact = mapper.createObjectNode().put("tenantId", context.tenantId())
                            .put("warehouseId", text(order, "toWarehouseId"))
                            .put("productId", text(order, "productId"))
                            .put("qualifiedOnHandQty", text(order, "transferQty"))
                            .put("allocatedReservedQty", "0").put("frozenQty", "0").put("safetyStockQty", "0")
                            .put("inTransitQty", "0").put("fulfillableQty", text(order, "transferQty"))
                            .put("uom", text(order, "uom")).put("formulaVersion", "FULFILLABLE-V1")
                            .put("factVersion", 1).put("sourceSystem", "REFERENCE_WMS")
                            .put("sourceEventId", UUID.randomUUID().toString()).put("asOf", timestamp);
                } else {
                    newFact = current.deepCopy();
                    newFact.put("qualifiedOnHandQty", add(text(current, "qualifiedOnHandQty"), text(order, "transferQty")))
                            .put("fulfillableQty", add(text(current, "fulfillableQty"), text(order, "transferQty")))
                            .put("factVersion", current.path("factVersion").asInt() + 1)
                            .put("sourceEventId", UUID.randomUUID().toString()).put("sourceSystem", "REFERENCE_WMS")
                            .put("asOf", timestamp);
                }
                repository.saveAvailability(newFact);
                transaction = addTransactionRecord(repository, context, "TRANSFER_INBOUND",
                        text(order, "toWarehouseId"), text(order, "productId"), text(order, "transferQty"),
                        text(order, "uom"), "TransferOrder", id, null, newFact.path("factVersion").asInt(), timestamp);
                updated = nextVersion(order, version(order) + 1).put("status", "RECEIVED")
                        .put("receivedQty", text(order, "transferQty")).put("receivedAt", timestamp);
                availability = newFact;
            } else {
                if (Set.of("RECEIVED", "CANCELED").contains(text(order, "status"))) {
                    throw conflict("调拨单当前状态不可取消", "刷新调拨单后重试");
                }
                updated = nextVersion(order, version(order) + 1).put("status", "CANCELED");
            }
            repository.put(context.tenantId(), id, updated, store.transferOrders);
            audit(repository, context, "TransferOrder", id, version(updated), action,
                    text(order, "correlationId"), order, updated, text(input, "reason"));
            ObjectNode body = mapper.createObjectNode().set("transfer", updated);
            if (availability != null) body.set("availability", availability);
            if (transaction != null) body.set("transaction", transaction);
            return new Command(200, body, String.valueOf(version(updated)), false);
        });
    }

    public Map<String, Object> stocktakeTasks(RequestContext context) {
        require(context, "inventory.stocktake.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.stocktakeTasks));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "createdAt")).reversed());
        return listResult(values);
    }

    public Command createPurchaseRequest(RequestContext context, JsonNode input) {
        require(context, "procurement.request.create");
        requireText(input, "mrpTaskId", 100, true);
        requireText(input, "demandId", 100, true);
        requireText(input, "materialId", 100, true);
        return command(context, "procurement.request.create", input, repository -> {
            JsonNode task = productionTaskReader == null ? null
                    : productionTaskReader.apply(context.tenantId(), text(input, "mrpTaskId")).orElse(null);
            if (task == null || !"MRP_RUN".equals(text(task, "taskType"))
                    || !"SUCCEEDED".equals(text(task, "status"))) {
                throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "MRP 结果不存在或尚未成功",
                        "使用成功且包含缺料结果的 MRP 任务创建采购申请");
            }
            JsonNode shortage = streamNodes(task.path("result").withArray("materialShortages"))
                    .filter(item -> text(item, "demandId").equals(text(input, "demandId"))
                            && text(item, "materialId").equals(text(input, "materialId")))
                    .findFirst().orElse(null);
            if (shortage == null || compare(text(shortage, "shortageQty"), "0") <= 0) {
                throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "MRP 任务没有对应采购缺口",
                        "刷新 MRP 结果后选择仍有缺口的采购物料");
            }
            Optional<JsonNode> existing = store.list(context.tenantId(), store.purchaseRequests).stream()
                    .filter(value -> text(value, "mrpTaskId").equals(text(input, "mrpTaskId"))
                            && text(value, "demandId").equals(text(input, "demandId"))
                            && text(value, "materialId").equals(text(input, "materialId")))
                    .findFirst();
            if (existing.isPresent()) return new Command(200, existing.get(), null, false);
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode value = mapper.createObjectNode()
                    .put("id", id).put("tenantId", context.tenantId())
                    .put("requestNo", "PR-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + id.substring(0, 8).toUpperCase())
                    .put("mrpTaskId", text(input, "mrpTaskId")).put("demandId", text(input, "demandId"))
                    .put("materialId", text(input, "materialId"))
                    .put("materialName", text(shortage, "materialName"))
                    .put("warehouseId", text(shortage, "warehouseId"))
                    .put("requiredQty", text(shortage, "shortageQty")).put("uom", text(shortage, "uom"))
                    .put("requiredDate", text(shortage, "requiredDate")).put("status", "PENDING_APPROVAL")
                    .put("correlationId", UUID.randomUUID().toString()).put("createdBy", context.actorId())
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            repository.put(context.tenantId(), id, value, store.purchaseRequests);
            audit(repository, context, "PurchaseRequest", id, 1, "CREATE_FROM_MRP",
                    text(value, "correlationId"), null, value, null);
            outbox(repository, context, "procurement.purchase-request.created.v1", "PurchaseRequest", id, 1,
                    text(value, "correlationId"), Map.of("purchaseRequestId", id,
                            "mrpTaskId", text(input, "mrpTaskId"), "demandId", text(input, "demandId"),
                            "materialId", text(input, "materialId")));
            return new Command(201, value, "1", false);
        });
    }

    public Map<String, Object> purchaseRequests(RequestContext context) {
        require(context, "procurement.request.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.purchaseRequests));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "createdAt")).reversed());
        return listResult(values);
    }

    public Command approvePurchaseRequest(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.request.approve");
        requireText(input, "supplierId", 100, true);
        requireText(input, "supplierName", 200, true);
        requireText(input, "promisedDate", 20, true);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "procurement.request.approve", commandInput, repository -> {
            JsonNode request = repository.get(context.tenantId(), id, store.purchaseRequests).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购申请不存在", "刷新采购申请列表后重试"));
            requireVersion(context, version(request));
            if (text(request, "createdBy").equals(context.actorId())) {
                throw new ApiException(403, "FULFILLMENT_403_PERMISSION_DENIED", "采购申请制单人不能审批本人申请",
                        "由其他采购审批人操作");
            }
            if (!"PENDING_APPROVAL".equals(text(request, "status"))) {
                throw conflict("采购申请当前不可审批", "刷新后查看既有采购订单");
            }
            String timestamp = now();
            String orderId = UUID.randomUUID().toString();
            String unitPrice = text(input, "unitPrice", "0");
            String taxRate = text(input, "taxRate", "0");
            ObjectNode order = mapper.createObjectNode().put("id", orderId).put("tenantId", context.tenantId())
                    .put("orderNo", "PO-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + orderId.substring(0, 8).toUpperCase())
                    .put("purchaseRequestId", text(request, "id")).put("demandId", text(request, "demandId"))
                    .put("materialId", text(request, "materialId"))
                    .put("materialName", text(request, "materialName"))
                    .put("warehouseId", text(request, "warehouseId"))
                    .put("orderedQty", text(request, "requiredQty")).put("receivedQty", "0")
                    .put("uom", text(request, "uom")).put("supplierId", text(input, "supplierId"))
                    .put("supplierName", text(input, "supplierName"))
                    .put("promisedDate", text(input, "promisedDate")).put("unitPrice", unitPrice)
                    .put("taxRate", taxRate).put("currency", text(input, "currency", "CNY"))
                    .put("totalAmount", lineAmount(text(request, "requiredQty"), unitPrice, taxRate))
                    .put("status", "CONFIRMED").put("correlationId", text(request, "correlationId"))
                    .put("createdBy", context.actorId()).put("version", 1)
                    .put("createdAt", timestamp).put("updatedAt", timestamp);
            ObjectNode updated = nextVersion(request, version(request) + 1)
                    .put("status", "CONVERTED").put("approvedBy", context.actorId())
                    .put("approvedAt", timestamp).put("purchaseOrderId", orderId);
            repository.put(context.tenantId(), orderId, order, store.purchaseOrders);
            repository.put(context.tenantId(), id, updated, store.purchaseRequests);
            audit(repository, context, "PurchaseRequest", id, version(updated), "APPROVE_AND_CREATE_PO",
                    text(request, "correlationId"), request, updated, null);
            outbox(repository, context, "procurement.purchase-order.created.v1", "PurchaseOrder", orderId, 1,
                    text(order, "correlationId"), Map.of("purchaseOrderId", orderId,
                            "purchaseRequestId", id, "demandId", text(order, "demandId"),
                            "materialId", text(order, "materialId")));
            ObjectNode body = mapper.createObjectNode(); body.set("request", updated); body.set("order", order);
            return new Command(201, body, String.valueOf(version(updated)), false);
        });
    }

    public Map<String, Object> purchaseOrders(RequestContext context) {
        require(context, "procurement.order.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.purchaseOrders));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "createdAt")).reversed());
        return listResult(values);
    }

    public Command receivePurchaseOrder(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.receipt.post");
        requireText(input, "externalTransactionId", 100, true);
        requireText(input, "receivedAt", 40, true);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "procurement.receipt.post", commandInput, repository -> {
            JsonNode order = repository.get(context.tenantId(), id, store.purchaseOrders).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购订单不存在", "刷新采购订单列表后重试"));
            requireVersion(context, version(order));
            String externalId = text(input, "externalTransactionId");
            if (Set.of("RECEIVED", "CANCELED").contains(text(order, "status"))) {
                Optional<JsonNode> existing = repository.list(context.tenantId(), store.purchaseReceipts).stream()
                        .filter(value -> text(value, "externalTransactionId").equals(externalId)
                                && text(value, "purchaseOrderId").equals(id)).findFirst();
                if (existing.isPresent()) {
                    ObjectNode body = mapper.createObjectNode(); body.set("order", order); body.set("receipt", existing.get());
                    return new Command(200, body, String.valueOf(version(order)), false);
                }
                throw conflict("CANCELED".equals(text(order, "status")) ? "采购订单已取消" : "采购订单已经完成入库",
                        "查询既有采购入库单");
            }
            if (!Set.of("CONFIRMED", "PARTIALLY_RECEIVED").contains(text(order, "status"))) {
                throw conflict("采购订单当前状态不可收货", "刷新采购订单后重试");
            }
            String qty = text(input, "receivedQty", text(order, "orderedQty"));
            if (!qty.matches(DECIMAL_PATTERN) || new BigDecimal(qty).signum() <= 0) {
                throw badRequest("receivedQty 必须大于 0",
                        List.of(new ApiException.FieldError("receivedQty", "positive_decimal")));
            }
            String receivedQty = add(text(order, "receivedQty"), qty);
            if (compare(receivedQty, text(order, "orderedQty")) > 0) {
                throw badRequest("收货数量超过采购订单数量", List.of(new ApiException.FieldError("receivedQty", "exceeded")));
            }
            boolean inspection = input.path("requireInspection").asBoolean(false);
            String timestamp = text(input, "receivedAt");
            JsonNode fact = null;
            JsonNode transaction = null;
            if (!inspection) {
                JsonNode current = repository.availability(context.tenantId(), text(order, "warehouseId"),
                        text(order, "materialId")).orElse(null);
                if (current != null && !text(current, "uom").equals(text(order, "uom"))) {
                    throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED",
                            "采购入库单位与物料库存单位不一致", "修正采购订单单位后重试");
                }
                fact = upsertInboundFact(repository, context, current, text(order, "warehouseId"),
                        text(order, "materialId"), qty, text(order, "uom"), externalId, timestamp);
                transaction = manualTransaction(context, "PURCHASE_RECEIPT_INBOUND", text(order, "warehouseId"),
                        text(order, "materialId"), qty, text(order, "uom"), "PurchaseOrder", id, externalId,
                        text(fact, "factVersion"), text(order, "correlationId"), timestamp);
                if (!repository.addTransaction(transaction)) {
                    throw conflict("采购入库外部流水号已存在", "查询既有采购入库结果");
                }
                repository.saveAvailability(fact);
            }
            String receiptId = UUID.randomUUID().toString();
            ObjectNode receipt = mapper.createObjectNode().put("id", receiptId).put("tenantId", context.tenantId())
                    .put("receiptNo", "RCV-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + receiptId.substring(0, 8).toUpperCase())
                    .put("purchaseOrderId", id).put("demandId", text(order, "demandId"))
                    .put("materialId", text(order, "materialId")).put("warehouseId", text(order, "warehouseId"))
                    .put("receivedQty", qty).put("uom", text(order, "uom"))
                    .put("externalTransactionId", externalId)
                    .put("inventoryFactVersion", fact == null ? 0 : fact.path("factVersion").asInt())
                    .put("status", inspection ? "PENDING_INSPECTION" : "POSTED")
                    .put("correlationId", text(order, "correlationId")).put("receivedBy", context.actorId())
                    .put("receivedAt", timestamp).put("version", 1);
            ObjectNode updated = nextVersion(order, version(order) + 1)
                    .put("receivedQty", receivedQty)
                    .put("status", compare(receivedQty, text(order, "orderedQty")) >= 0
                            ? "RECEIVED" : "PARTIALLY_RECEIVED").put("updatedAt", timestamp);
            repository.put(context.tenantId(), receiptId, receipt, store.purchaseReceipts);
            repository.put(context.tenantId(), id, updated, store.purchaseOrders);
            audit(repository, context, "PurchaseOrder", id, version(updated), "POST_RECEIPT",
                    text(order, "correlationId"), order, updated, null);
            if (!inspection) {
                outbox(repository, context, "inventory.purchase-receipt.posted.v1", "PurchaseReceipt",
                        receiptId, 1, text(order, "correlationId"), Map.of("purchaseReceiptId", receiptId,
                                "purchaseOrderId", id, "demandId", text(order, "demandId"),
                                "materialId", text(order, "materialId"), "receivedQty", qty,
                                "inventoryFactVersion", fact.path("factVersion").asInt()));
            }
            ObjectNode body = mapper.createObjectNode(); body.set("order", updated); body.set("receipt", receipt);
            if (fact != null) body.set("availability", fact);
            if (transaction != null) body.set("transaction", transaction);
            return new Command(201, body, String.valueOf(version(updated)), false);
        });
    }

    public Map<String, Object> purchaseReceipts(RequestContext context) {
        require(context, "procurement.receipt.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.purchaseReceipts));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "receivedAt")).reversed());
        return listResult(values);
    }

    public Command createSupplier(RequestContext context, JsonNode input) {
        require(context, "procurement.supplier.create");
        requireText(input, "code", 50, true);
        requireText(input, "name", 200, true);
        return command(context, "procurement.supplier.create", input, repository -> {
            Optional<JsonNode> existing = repository.list(context.tenantId(), store.suppliers).stream()
                    .filter(value -> text(value, "code").equals(text(input, "code"))).findFirst();
            if (existing.isPresent()) return new Command(200, existing.get(), null, false);
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode value = mapper.createObjectNode().put("id", id).put("tenantId", context.tenantId())
                    .put("code", text(input, "code")).put("name", text(input, "name"))
                    .put("rating", text(input, "rating", "B")).put("leadTimeDays", input.path("leadTimeDays").asInt(7))
                    .put("minOrderQty", text(input, "minOrderQty", "1"))
                    .put("paymentTerms", text(input, "paymentTerms", "net30")).put("status", "enabled")
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            for (String field : new String[]{"shortName", "contactPerson", "phone", "email", "address",
                    "bankAccount", "taxNo", "remark"}) copyIfPresent(value, input, field);
            repository.put(context.tenantId(), id, value, store.suppliers);
            audit(repository, context, "Supplier", id, 1, "CREATE", UUID.randomUUID().toString(), null, value, null);
            return new Command(201, value, "1", false);
        });
    }

    public Map<String, Object> suppliers(RequestContext context) {
        require(context, "procurement.supplier.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.suppliers));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "updatedAt")).reversed());
        return listResult(values);
    }

    public JsonNode supplier(RequestContext context, String id) {
        require(context, "procurement.supplier.read");
        return store.get(context.tenantId(), id, store.suppliers).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "供应商不存在", "刷新供应商列表后重试"));
    }

    public Command updateSupplier(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.supplier.update");
        return command(context, "procurement.supplier.update", input, repository -> {
            JsonNode current = repository.get(context.tenantId(), id, store.suppliers).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "供应商不存在", "刷新供应商列表后重试"));
            Integer expected = input.hasNonNull("version") ? input.path("version").asInt() : context.expectedVersion();
            if (expected == null || expected != version(current)) {
                throw conflict("供应商数据已被其他操作更新", "刷新供应商数据后重试");
            }
            ObjectNode updated = current.deepCopy();
            for (String field : new String[]{"code", "name", "shortName", "contactPerson", "phone", "email",
                    "address", "bankAccount", "taxNo", "rating", "leadTimeDays", "minOrderQty", "paymentTerms",
                    "status", "remark"}) {
                if (input.hasNonNull(field)) updated.set(field, input.get(field).deepCopy());
            }
            updated.put("version", version(current) + 1).put("updatedAt", now());
            repository.put(context.tenantId(), id, updated, store.suppliers);
            audit(repository, context, "Supplier", id, version(updated), "UPDATE",
                    UUID.randomUUID().toString(), current, updated, null);
            return new Command(200, updated, String.valueOf(version(updated)), false);
        });
    }

    public Command deleteSupplier(RequestContext context, String id) {
        require(context, "procurement.supplier.delete");
        return command(context, "procurement.supplier.delete", mapper.createObjectNode().put("id", id), repository -> {
            JsonNode current = repository.get(context.tenantId(), id, store.suppliers).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "供应商不存在", "刷新供应商列表后重试"));
            repository.remove(context.tenantId(), id, store.suppliers);
            audit(repository, context, "Supplier", id, version(current), "DELETE",
                    UUID.randomUUID().toString(), current, null, null);
            return new Command(200, mapper.createObjectNode().put("deleted", true), null, false);
        });
    }

    public Command rejectPurchaseRequest(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.request.reject");
        requireText(input, "reason", 500, true);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "procurement.request.reject", commandInput, repository -> {
            JsonNode request = repository.get(context.tenantId(), id, store.purchaseRequests).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购申请不存在", "刷新采购申请列表后重试"));
            requireVersion(context, version(request));
            if (!"PENDING_APPROVAL".equals(text(request, "status"))) {
                throw conflict("采购申请当前不可驳回", "刷新后查看采购申请状态");
            }
            ObjectNode updated = nextVersion(request, version(request) + 1).put("status", "REJECTED")
                    .put("rejectedBy", context.actorId()).put("rejectedAt", now())
                    .put("rejectReason", text(input, "reason"));
            repository.put(context.tenantId(), id, updated, store.purchaseRequests);
            audit(repository, context, "PurchaseRequest", id, version(updated), "REJECT",
                    text(request, "correlationId"), request, updated, text(input, "reason"));
            outbox(repository, context, "procurement.purchase-request.rejected.v1", "PurchaseRequest",
                    id, version(updated), text(request, "correlationId"), Map.of("purchaseRequestId", id,
                            "reason", text(input, "reason")));
            return new Command(200, mapper.createObjectNode().set("request", updated),
                    String.valueOf(version(updated)), false);
        });
    }

    public Command cancelPurchaseOrder(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.order.cancel");
        requireText(input, "reason", 500, true);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "procurement.order.cancel", commandInput, repository -> {
            JsonNode order = repository.get(context.tenantId(), id, store.purchaseOrders).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购订单不存在", "刷新采购订单列表后重试"));
            requireVersion(context, version(order));
            if ("RECEIVED".equals(text(order, "status"))) {
                throw conflict("已完全入库的采购订单不可取消", "查询既有采购入库记录");
            }
            if ("CANCELED".equals(text(order, "status"))) throw conflict("采购订单已取消", "刷新采购订单列表");
            ObjectNode updated = nextVersion(order, version(order) + 1).put("status", "CANCELED")
                    .put("cancelReason", text(input, "reason")).put("canceledAt", now());
            repository.put(context.tenantId(), id, updated, store.purchaseOrders);
            audit(repository, context, "PurchaseOrder", id, version(updated), "CANCEL",
                    text(order, "correlationId"), order, updated, text(input, "reason"));
            outbox(repository, context, "procurement.purchase-order.canceled.v1", "PurchaseOrder",
                    id, version(updated), text(order, "correlationId"), Map.of("purchaseOrderId", id,
                            "reason", text(input, "reason")));
            return new Command(200, mapper.createObjectNode().set("order", updated),
                    String.valueOf(version(updated)), false);
        });
    }

    public Command inspectReceipt(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.receipt.inspect");
        String result = text(input, "result");
        if (!Set.of("ACCEPTED", "REJECTED").contains(result)) {
            throw badRequest("result 只能是 ACCEPTED 或 REJECTED",
                    List.of(new ApiException.FieldError("result", "invalid")));
        }
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("receiptId", id).put("version", requiredVersion(context));
        return command(context, "procurement.receipt.inspect", commandInput, repository -> {
            JsonNode target = repository.list(context.tenantId(), store.purchaseReceipts).stream()
                    .filter(value -> text(value, "id").equals(id)).findFirst().orElseThrow(() ->
                            new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购入库单不存在", "刷新入库单列表后重试"));
            requireVersion(context, version(target));
            if (!Set.of("PENDING_INSPECTION", "INSPECTING").contains(text(target, "status"))) {
                throw conflict("入库单当前状态不可质检", "刷新后查看入库单状态");
            }
            String timestamp = now();
            ObjectNode updated = nextVersion(target, version(target) + 1)
                    .put("status", "REJECTED".equals(result) ? "REJECTED" : "POSTED")
                    .put("inspectedBy", context.actorId()).put("inspectedAt", timestamp)
                    .put("inspectionResult", result).put("inspectionRemark", text(input, "remark"));
            if ("REJECTED".equals(result)) {
                repository.put(context.tenantId(), id, updated, store.purchaseReceipts);
                audit(repository, context, "PurchaseReceipt", id, version(updated), "INSPECT_REJECTED",
                        text(target, "correlationId"), target, updated, null);
                return new Command(200, mapper.createObjectNode().set("receipt", updated),
                        String.valueOf(version(updated)), false);
            }
            JsonNode order = repository.get(context.tenantId(), text(target, "purchaseOrderId"),
                    store.purchaseOrders).orElseThrow(() -> new ApiException(404,
                    "FULFILLMENT_404_NOT_FOUND", "关联采购订单不存在", "检查采购订单数据完整性"));
            JsonNode current = repository.availability(context.tenantId(), text(target, "warehouseId"),
                    text(target, "materialId")).orElse(null);
            JsonNode fact = upsertInboundFact(repository, context, current, text(target, "warehouseId"),
                    text(target, "materialId"), text(target, "receivedQty"), text(target, "uom"),
                    text(target, "externalTransactionId"), timestamp);
            JsonNode transaction = manualTransaction(context, "PURCHASE_RECEIPT_INBOUND",
                    text(target, "warehouseId"), text(target, "materialId"), text(target, "receivedQty"),
                    text(target, "uom"), "PurchaseReceipt", id, "INSP-" + text(target, "externalTransactionId"),
                    text(fact, "factVersion"), text(target, "correlationId"), timestamp);
            if (!repository.addTransaction(transaction)) {
                throw conflict("采购入库外部流水号已存在", "查询既有采购入库结果");
            }
            repository.saveAvailability(fact);
            updated.put("inventoryFactVersion", fact.path("factVersion").asInt());
            repository.put(context.tenantId(), id, updated, store.purchaseReceipts);
            audit(repository, context, "PurchaseReceipt", id, version(updated), "INSPECT_ACCEPTED",
                    text(target, "correlationId"), target, updated, null);
            outbox(repository, context, "inventory.purchase-receipt.posted.v1", "PurchaseReceipt",
                    id, version(updated), text(target, "correlationId"), Map.of("purchaseReceiptId", id,
                            "purchaseOrderId", text(order, "id"), "materialId", text(target, "materialId"),
                            "receivedQty", text(target, "receivedQty"),
                            "inventoryFactVersion", fact.path("factVersion").asInt()));
            ObjectNode body = mapper.createObjectNode(); body.set("receipt", updated); body.set("availability", fact); body.set("transaction", transaction);
            return new Command(200, body, String.valueOf(version(updated)), false);
        });
    }

    public Command createPurchaseReturn(RequestContext context, JsonNode input) {
        require(context, "procurement.return.create");
        requireText(input, "purchaseReceiptId", 100, true);
        requireText(input, "reason", 500, true);
        return command(context, "procurement.return.create", input, repository -> {
            JsonNode receipt = repository.list(context.tenantId(), store.purchaseReceipts).stream()
                    .filter(value -> text(value, "id").equals(text(input, "purchaseReceiptId"))).findFirst()
                    .orElseThrow(() -> new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "采购入库单不存在",
                            "刷新入库单列表后重试"));
            JsonNode order = repository.get(context.tenantId(), text(receipt, "purchaseOrderId"),
                    store.purchaseOrders).orElseThrow(() -> new ApiException(404,
                    "FULFILLMENT_404_NOT_FOUND", "关联采购订单不存在", "检查采购订单数据完整性"));
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode value = mapper.createObjectNode().put("id", id).put("tenantId", context.tenantId())
                    .put("returnNo", "RET-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + id.substring(0, 8).toUpperCase())
                    .put("purchaseReceiptId", text(receipt, "id"))
                    .put("purchaseOrderId", text(order, "id")).put("supplierId", text(order, "supplierId"))
                    .put("supplierName", text(order, "supplierName")).put("materialId", text(receipt, "materialId"))
                    .put("warehouseId", text(receipt, "warehouseId"))
                    .put("returnQty", text(input, "returnQty", text(receipt, "receivedQty")))
                    .put("uom", text(receipt, "uom")).put("reason", text(input, "reason"))
                    .put("status", "pending").put("remark", text(input, "remark")).put("version", 1)
                    .put("createdAt", timestamp).put("updatedAt", timestamp).put("createdBy", context.actorId());
            repository.put(context.tenantId(), id, value, store.purchaseReturns);
            audit(repository, context, "PurchaseReturn", id, 1, "CREATE", UUID.randomUUID().toString(), null, value, null);
            outbox(repository, context, "procurement.purchase-return.created.v1", "PurchaseReturn", id, 1,
                    UUID.randomUUID().toString(), Map.of("purchaseReturnId", id,
                            "purchaseReceiptId", text(receipt, "id"), "returnQty", text(value, "returnQty")));
            return new Command(201, value, "1", false);
        });
    }

    public Command processPurchaseReturn(RequestContext context, String id, JsonNode input) {
        require(context, "procurement.return.process");
        requireText(input, "externalTransactionId", 100, true);
        ObjectNode commandInput = input.deepCopy();
        commandInput.put("id", id).put("version", requiredVersion(context));
        return command(context, "procurement.return.process", commandInput, repository -> {
            JsonNode current = repository.get(context.tenantId(), id, store.purchaseReturns).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "退货单不存在", "刷新退货单列表后重试"));
            requireVersion(context, version(current));
            if (!Set.of("pending", "processing").contains(text(current, "status"))) {
                throw conflict("退货单当前状态不可处理", "刷新退货单状态后重试");
            }
            String timestamp = now();
            JsonNode existing = repository.availability(context.tenantId(), text(current, "warehouseId"),
                    text(current, "materialId")).orElse(null);
            String qualified = subtract(existing == null ? "0" : text(existing, "qualifiedOnHandQty"),
                    text(current, "returnQty"));
            String fulfillable = subtract(existing == null ? "0" : text(existing, "fulfillableQty"),
                    text(current, "returnQty"));
            ObjectNode fact = existing == null ? mapper.createObjectNode() : existing.deepCopy();
            fact.put("tenantId", context.tenantId()).put("warehouseId", text(current, "warehouseId"))
                    .put("productId", text(current, "materialId")).put("qualifiedOnHandQty", qualified)
                    .put("fulfillableQty", fulfillable)
                    .put("allocatedReservedQty", text(existing, "allocatedReservedQty", "0"))
                    .put("frozenQty", text(existing, "frozenQty", "0"))
                    .put("safetyStockQty", text(existing, "safetyStockQty", "0"))
                    .put("inTransitQty", text(existing, "inTransitQty", "0")).put("uom", text(current, "uom"))
                    .put("formulaVersion", "FULFILLABLE-V1")
                    .put("factVersion", existing == null ? 1 : existing.path("factVersion").asInt() + 1)
                    .put("sourceSystem", "REFERENCE_WMS")
                    .put("sourceEventId", text(input, "externalTransactionId")).put("asOf", timestamp);
            JsonNode transaction = manualTransaction(context, "RESERVATION_RELEASE", text(current, "warehouseId"),
                    text(current, "materialId"), text(current, "returnQty"), text(current, "uom"),
                    "PurchaseReturn", id, text(input, "externalTransactionId"), text(fact, "factVersion"),
                    UUID.randomUUID().toString(), timestamp);
            if (!repository.addTransaction(transaction)) {
                throw conflict("退货外部流水号已存在", "查询既有退货结果");
            }
            repository.saveAvailability(fact);
            ObjectNode updated = nextVersion(current, version(current) + 1).put("status", "done")
                    .put("externalTransactionId", text(input, "externalTransactionId")).put("updatedAt", timestamp);
            repository.put(context.tenantId(), id, updated, store.purchaseReturns);
            audit(repository, context, "PurchaseReturn", id, version(updated), "PROCESS",
                    UUID.randomUUID().toString(), current, updated, null);
            outbox(repository, context, "procurement.purchase-return.processed.v1", "PurchaseReturn",
                    id, version(updated), UUID.randomUUID().toString(), Map.of("purchaseReturnId", id,
                            "externalTransactionId", text(input, "externalTransactionId"),
                            "returnQty", text(current, "returnQty")));
            ObjectNode body = mapper.createObjectNode(); body.set("ret", updated); body.set("availability", fact); body.set("transaction", transaction);
            return new Command(200, body, String.valueOf(version(updated)), false);
        });
    }

    public Map<String, Object> purchaseReturns(RequestContext context) {
        require(context, "procurement.return.read");
        List<JsonNode> values = new ArrayList<>(store.list(context.tenantId(), store.purchaseReturns));
        values.sort(Comparator.comparing((JsonNode value) -> text(value, "createdAt")).reversed());
        return listResult(values);
    }

    public JsonNode stocktakeTask(RequestContext context, String id) {
        require(context, "inventory.stocktake.read");
        return store.get(context.tenantId(), id, store.stocktakeTasks).orElseThrow(() ->
                new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "盘点单不存在", "刷新盘点单列表后重试"));
    }

    public Command createStocktakeTask(RequestContext context, JsonNode input) {
        require(context, "inventory.stocktake.create");
        requireText(input, "warehouseId", 100, true);
        if (input.withArray("lines").isEmpty() || input.withArray("lines").size() > 500) {
            throw badRequest("盘点行必须为 1 到 500 行", List.of(new ApiException.FieldError("lines", "invalid")));
        }
        for (JsonNode line : input.withArray("lines")) {
            requireText(line, "productId", 100, true);
            requireDecimal(line, "systemQty", false);
            requireText(line, "uom", 20, true);
        }
        return command(context, "inventory.stocktake.create", input, repository -> {
            String id = UUID.randomUUID().toString();
            String timestamp = now();
            ObjectNode value = mapper.createObjectNode().put("id", id).put("tenantId", context.tenantId())
                    .put("stocktakeNo", "ST-" + timestamp.substring(0, 10).replace("-", "") + "-"
                            + id.substring(0, 8).toUpperCase())
                    .put("warehouseId", text(input, "warehouseId"))
                    .put("scope", text(input, "scope", "full")).put("status", "DRAFT")
                    .put("reason", text(input, "reason")).put("assignedTo", text(input, "assignedTo"))
                    .put("correlationId", UUID.randomUUID().toString()).put("createdBy", context.actorId())
                    .put("version", 1).put("createdAt", timestamp).put("updatedAt", timestamp);
            ArrayNode lines = value.putArray("lines");
            for (JsonNode line : input.withArray("lines")) {
                ObjectNode item = line.deepCopy();
                item.put("id", UUID.randomUUID().toString()).put("lineStatus", "PENDING")
                        .put("remark", text(line, "remark")).put("version", 1);
                lines.add(item);
            }
            repository.put(context.tenantId(), id, value, store.stocktakeTasks);
            audit(repository, context, "StocktakeTask", id, 1, "CREATE", text(value, "correlationId"), null, value, null);
            return new Command(201, wrapper("Stocktake", value), "1", false);
        });
    }

    public Command stocktakeAction(
            RequestContext context, String id, String action, JsonNode input
    ) {
        String permission = switch (action) {
            case "APPROVE" -> "inventory.stocktake.approve";
            case "START", "COUNT" -> "inventory.stocktake.execute";
            default -> "inventory.stocktake.adjust";
        };
        require(context, permission);
        ObjectNode commandInput = input == null ? mapper.createObjectNode() : input.deepCopy();
        commandInput.put("id", id);
        return command(context, "inventory.stocktake." + action.toLowerCase(), commandInput, repository -> {
            JsonNode task = repository.get(context.tenantId(), id, store.stocktakeTasks).orElseThrow(() ->
                    new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "盘点单不存在", "刷新盘点单列表后重试"));
            requireVersion(context, version(task));
            String timestamp = now();
            ObjectNode updated;
            if ("APPROVE".equals(action)) {
                if (!Set.of("DRAFT", "PENDING_APPROVAL").contains(text(task, "status"))) {
                    throw conflict("盘点单当前状态不可审批", "刷新盘点单后重试");
                }
                updated = nextVersion(task, version(task) + 1).put("status", "APPROVED")
                        .put("approvedBy", context.actorId()).put("approvedAt", timestamp);
            } else if ("START".equals(action)) {
                if (!"APPROVED".equals(text(task, "status"))) {
                    throw conflict("盘点单当前状态不可开始", "刷新盘点单后重试");
                }
                updated = nextVersion(task, version(task) + 1).put("status", "IN_PROGRESS")
                        .put("startedAt", timestamp);
            } else if ("COUNT".equals(action)) {
                if (!"IN_PROGRESS".equals(text(task, "status"))) {
                    throw conflict("盘点单当前状态不可录入", "刷新盘点单后重试");
                }
                updated = task.deepCopy();
                for (JsonNode inputLine : input.withArray("lines")) {
                    JsonNode current = findById(updated.withArray("lines"), text(inputLine, "lineId"));
                    if (current == null) {
                        throw new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "盘点行不存在", "刷新盘点单后重试");
                    }
                    ObjectNode line = (ObjectNode) current;
                    line.put("countedQty", text(inputLine, "countedQty"))
                            .put("varianceQty", subtract(text(inputLine, "countedQty"), text(line, "systemQty")))
                            .put("lineStatus", "COUNTED").put("countedBy", context.actorId())
                            .put("countedAt", timestamp);
                    if (inputLine.hasNonNull("remark")) line.put("remark", text(inputLine, "remark"));
                }
                boolean allCounted = streamNodes(updated.withArray("lines")).allMatch(line ->
                        Set.of("COUNTED", "SKIP").contains(text(line, "lineStatus")));
                updated.put("version", version(task) + 1).put("updatedAt", timestamp)
                        .put("status", allCounted ? "COMPLETED" : "IN_PROGRESS");
                if (allCounted) updated.put("completedAt", timestamp);
            } else {
                if (!"COMPLETED".equals(text(task, "status"))) {
                    throw conflict("盘点单当前状态不可调整库存", "刷新盘点单后重试");
                }
                updated = task.deepCopy();
                ArrayNode adjustments = mapper.createArrayNode();
                for (JsonNode line : updated.withArray("lines")) {
                    if (!"COUNTED".equals(text(line, "lineStatus"))) continue;
                    String variance = text(line, "varianceQty");
                    if (variance.isBlank()) variance = "0";
                    if (compare(variance, "0") == 0) {
                        ((ObjectNode) line).put("lineStatus", "ADJUSTED");
                        continue;
                    }
                    JsonNode fact = repository.availability(context.tenantId(), text(task, "warehouseId"),
                            text(line, "productId")).orElseThrow(() -> new ApiException(404,
                            "FULFILLMENT_404_NOT_FOUND", "库存事实不存在: " + text(line, "productId"),
                            "确认仓库库存后重试"));
                    ObjectNode newFact = fact.deepCopy();
                    boolean increase = compare(variance, "0") > 0;
                    String adjustmentQty = increase ? variance : variance.substring(1);
                    newFact.put("qualifiedOnHandQty", increase
                            ? add(text(fact, "qualifiedOnHandQty"), variance)
                            : subtract(text(fact, "qualifiedOnHandQty"), adjustmentQty))
                            .put("fulfillableQty", increase
                                    ? add(text(fact, "fulfillableQty"), variance)
                                    : subtract(text(fact, "fulfillableQty"), adjustmentQty))
                            .put("factVersion", fact.path("factVersion").asInt() + 1)
                            .put("sourceEventId", UUID.randomUUID().toString())
                            .put("sourceSystem", "REFERENCE_WMS").put("asOf", timestamp);
                    repository.saveAvailability(newFact);
                    JsonNode transaction = addTransactionRecord(repository, context, increase
                                    ? "STOCKTAKE_ADJUSTMENT_INBOUND" : "STOCKTAKE_ADJUSTMENT_OUTBOUND",
                            text(task, "warehouseId"), text(line, "productId"), variance, text(line, "uom"),
                            "StocktakeTask", id, text(line, "id"), newFact.path("factVersion").asInt(), timestamp);
                    ((ObjectNode) line).put("lineStatus", "ADJUSTED");
                    adjustments.add(mapper.createObjectNode().set("transaction", transaction));
                }
                updated.put("version", version(task) + 1).put("updatedAt", timestamp);
                outbox(repository, context, "inventory.stocktake.adjusted.v1", "StocktakeTask", id,
                        version(updated), UUID.randomUUID().toString(), Map.of("stocktakeId", id));
            }
            repository.put(context.tenantId(), id, updated, store.stocktakeTasks);
            audit(repository, context, "StocktakeTask", id, version(updated), action,
                    text(task, "correlationId"), task, updated, text(input, "reason"));
            return new Command(200, wrapper("Stocktake", updated), String.valueOf(version(updated)), false);
        });
    }

    private Optional<JsonNode> shipmentTaskById(String tenantId, String id) {
        return store.shipmentTasks(tenantId).stream()
                .filter(value -> text(value, "id").equals(id))
                .findFirst();
    }

    private JsonNode presentTask(JsonNode task) {
        ObjectNode value = task.deepCopy();
        JsonNode snapshot = value.get("recipientSnapshot");
        if (snapshot instanceof ObjectNode recipient) {
            ObjectNode copy = recipient.deepCopy();
            copy.remove("phoneCiphertext");
            copy.remove("phoneKeyId");
            value.set("recipient", copy);
        }
        value.remove("recipientSnapshot");
        return value;
    }

    private Map<String, Object> pageResult(List<?> values, int page, int pageSize) {
        int from = Math.min((page - 1) * pageSize, values.size());
        int to = Math.min(from + pageSize, values.size());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", values.subList(from, to));
        result.put("total", values.size());
        result.put("page", page);
        result.put("pageSize", pageSize);
        return result;
    }

    private Map<String, Object> listResult(List<?> values) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", values);
        result.put("total", values.size());
        return result;
    }

    private Command processingTask(JsonNode result, JsonNode task) {
        ObjectNode body = mapper.createObjectNode().put("outcome", text(result, "outcome"))
                .put("result", "PROCESSING_UNKNOWN").put("adapterKind", "REFERENCE")
                .put("traceId", "");
        body.set("task", presentTask(task));
        body.set("shipmentTask", presentTask(task));
        body.putArray("reservations");
        return new Command(202, body, String.valueOf(version(task)), false);
    }

    private JsonNode referenceReserve(
            String tenantId, String warehouseId, String idempotencyKey, boolean allowPartial, JsonNode lines
    ) {
        String cacheKey = "reserve:" + idempotencyKey;
        JsonNode existing = store.get(tenantId, cacheKey, store.wmsResults).orElse(null);
        if (existing != null) return existing.deepCopy();
        Map<String, String> required = new LinkedHashMap<>();
        for (JsonNode line : lines) {
            required.merge(text(line, "productId"), text(line, "requestedQty"), this::add);
        }
        Map<String, JsonNode> facts = new LinkedHashMap<>();
        java.util.Set<String> missingProductIds = new java.util.LinkedHashSet<>();
        for (String productId : required.keySet()) {
            JsonNode fact = store.availability(tenantId, warehouseId, productId).orElse(null);
            if (fact == null) {
                missingProductIds.add(productId);
                continue;
            }
            facts.put(productId, fact);
        }
        for (JsonNode line : lines) {
            JsonNode fact = facts.get(text(line, "productId"));
            if (fact != null && !text(fact, "uom").equals(text(line, "uom"))) {
                throw new ApiException(422, "FULFILLMENT_422_QUANTITY_VIOLATION",
                        "订单行与库存单位不一致", "核对产品单位后重新申请");
            }
        }
        Map<String, String> available = new LinkedHashMap<>();
        facts.forEach((productId, fact) -> available.put(productId, text(fact, "fulfillableQty")));
        missingProductIds.forEach(productId -> available.put(productId, "0"));
        boolean allEnough = required.entrySet().stream()
                .allMatch(entry -> compare(available.get(entry.getKey()), entry.getValue()) >= 0);
        boolean reserveNothing = !allowPartial && !allEnough;
        ArrayNode resultLines = mapper.createArrayNode();
        for (JsonNode line : lines) {
            String productId = text(line, "productId");
            String reserved = reserveNothing ? "0" : min(text(line, "requestedQty"), available.get(productId));
            available.put(productId, subtract(available.get(productId), reserved));
            ObjectNode value = line.deepCopy();
            value.put("reservedQty", reserved).put("shortageQty", subtract(text(line, "requestedQty"), reserved));
            resultLines.add(value);
        }
        Map<String, String> reservedByProduct = new LinkedHashMap<>();
        for (JsonNode line : resultLines) {
            reservedByProduct.merge(text(line, "productId"), text(line, "reservedQty"), this::add);
        }
        int maxFactVersion = 0;
        for (Map.Entry<String, String> entry : reservedByProduct.entrySet()) {
            if (compare(entry.getValue(), "0") <= 0) continue;
            JsonNode current = facts.get(entry.getKey());
            ObjectNode updated = current.deepCopy();
            updated.put("allocatedReservedQty", add(text(current, "allocatedReservedQty"), entry.getValue()))
                    .put("fulfillableQty", subtract(text(current, "fulfillableQty"), entry.getValue()))
                    .put("factVersion", current.path("factVersion").asInt() + 1)
                    .put("sourceEventId", UUID.randomUUID().toString()).put("sourceSystem", "REFERENCE_WMS")
                    .put("asOf", now());
            store.saveAvailability(updated);
            maxFactVersion = Math.max(maxFactVersion, updated.path("factVersion").asInt());
        }
        String totalReserved = streamNodes(resultLines).map(line -> text(line, "reservedQty")).reduce("0", this::add);
        boolean shortage = streamNodes(resultLines).anyMatch(line -> compare(text(line, "shortageQty"), "0") > 0);
        String outcome = compare(totalReserved, "0") == 0 ? "SHORTAGE" : shortage ? "PARTIALLY_SUCCEEDED" : "SUCCEEDED";
        ObjectNode result = mapper.createObjectNode().put("outcome", outcome).put("adapterKind", "REFERENCE")
                .put("externalReservationId", "REF-RES-" + UUID.randomUUID())
                .put("factVersion", maxFactVersion)
                .put("formulaVersion", facts.values().stream().findFirst()
                        .map(fact -> fact.path("formulaVersion").asText("FULFILLABLE-V1"))
                        .orElse("FULFILLABLE-V1"))
                .put("failureCode", missingProductIds.isEmpty() ? "" : "AVAILABILITY_FACT_MISSING");
        result.set("missingProductIds", mapper.valueToTree(missingProductIds));
        result.set("lines", resultLines);
        result.put("tenantId", tenantId);
        store.put(tenantId, cacheKey, result, store.wmsResults);
        return result;
    }

    private JsonNode referencePost(String tenantId, String kind, String idempotencyKey, String forcedOutcome, JsonNode lines) {
        String cacheKey = kind.toLowerCase() + ":" + idempotencyKey;
        JsonNode existing = store.get(tenantId, cacheKey, store.wmsResults).orElse(null);
        if (existing != null) return existing.deepCopy();
        ObjectNode result = mapper.createObjectNode().put("outcome", forcedOutcome)
                .put("adapterKind", "REFERENCE");
        ArrayNode externalIds = result.putArray("externalTransactionIds");
        ArrayNode resultLines = result.putArray("lines");
        if ("SUCCEEDED".equals(forcedOutcome)) {
            for (JsonNode line : lines) {
                externalIds.add("REF-" + kind + "-" + UUID.randomUUID());
                ObjectNode value = (ObjectNode) line.deepCopy();
                value.put("postedQty", text(line, "qty"));
                resultLines.add(value);
            }
        }
        result.put("tenantId", tenantId);
        store.put(tenantId, cacheKey, result, store.wmsResults);
        return result;
    }

    private ArrayNode copyLinesWithReserve(JsonNode lines, String reservedQty) {
        ArrayNode values = mapper.createArrayNode();
        for (JsonNode line : lines) {
            ObjectNode value = line.deepCopy();
            value.put("reservedQty", reservedQty).put("shortageQty", text(line, "requestedQty"));
            values.add(value);
        }
        return values;
    }

    private void syncReservationToSales(FulfillmentStore repository, JsonNode task, RequestContext context) {
        JsonNode request = repository.shipmentRequest(context.tenantId(), text(task, "shipmentRequestId")).orElse(null);
        JsonNode order = repository.order(context.tenantId(), text(task, "salesOrderId")).orElse(null);
        if (request == null || order == null) {
            throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "销售履约投影缺失", "检查跨域关联后重试");
        }
        boolean hasShortage = streamNodes(task.withArray("lines"))
                .anyMatch(line -> compare(text(line, "shortageQty"), "0") > 0);
        ObjectNode nextRequest = nextVersion(request, version(request) + 1)
                .put("workflowStatus", text(task, "workflowStatus"))
                .put("availabilityStatus", text(task, "availabilityStatus"))
                .put("replenishmentStatus", text(task, "replenishmentStatus"))
                .put("inventoryFactVersion", task.path("inventoryFactVersion").asInt())
                .put("outboundId", text(task, "outboundId"));
        ArrayNode requestLines = nextRequest.withArray("lines");
        for (JsonNode line : requestLines) {
            JsonNode taskLine = findById(task.withArray("lines"), text(line, "id"));
            if (taskLine != null) {
                ObjectNode value = (ObjectNode) line;
                value.put("reservedQty", text(taskLine, "reservedQty"))
                        .put("shortageQty", text(taskLine, "shortageQty"));
            }
        }
        ObjectNode nextOrder = nextVersion(order, version(order) + 1);
        boolean hasShipped = streamNodes(order.withArray("lines")).anyMatch(line -> compare(text(line, "shippedQty"), "0") > 0);
        if (!hasShortage && !hasShipped) nextOrder.put("overallStatus", "CONFIRMED");
        for (JsonNode line : nextOrder.withArray("lines")) {
            JsonNode taskLine = findById(task.withArray("lines"), text(line, "id"), "orderLineId");
            if (taskLine == null) continue;
            ObjectNode value = (ObjectNode) line;
            String reserved = "0";
            for (JsonNode activeTask : repository.shipmentTasks(context.tenantId())) {
                if (!text(activeTask, "salesOrderId").equals(text(order, "id"))) continue;
                JsonNode activeLine = findById(activeTask.withArray("lines"), text(line, "id"), "orderLineId");
                if (activeLine != null) reserved = add(reserved,
                        subtract(text(activeLine, "reservedQty"), text(activeLine, "postedQty")));
            }
            value.put("reservedQty", reserved).put("version", line.path("version").asInt() + 1);
            if (!hasShortage && compare(text(line, "shippedQty"), "0") == 0) value.put("lineStatus", "RESERVED");
        }
        repository.saveShipmentRequest(nextRequest);
        repository.saveOrder(nextOrder);
        audit(repository, context, "SalesOrder", text(order, "id"), version(nextOrder),
                "APPLY_RESERVATION", text(order, "correlationId"), presentOrder(order), presentOrder(nextOrder), null);
    }

    private JsonNode addTransactionRecord(
            FulfillmentStore repository, RequestContext context, String type, String warehouseId,
            String productId, String qty, String uom, String sourceType, String sourceId, String sourceLineId,
            int factVersion, String occurredAt
    ) {
        String externalId = "REF-TX-" + UUID.randomUUID();
        ObjectNode value = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("tenantId", context.tenantId()).put("transactionNo", transactionNo())
                .put("externalTransactionId", externalId).put("type", type)
                .put("warehouseId", warehouseId).put("productId", productId).put("qty", qty)
                .put("uom", uom).put("sourceType", sourceType).put("sourceId", sourceId)
                .put("correlationId", UUID.randomUUID().toString()).put("traceId", context.traceId())
                .put("occurredAt", occurredAt);
        if (sourceLineId != null && !sourceLineId.isBlank()) value.put("sourceLineId", sourceLineId);
        if (factVersion > 0) value.put("factVersion", factVersion);
        repository.addTransaction(value);
        return value;
    }

    private JsonNode manualTransaction(
            RequestContext context, String type, String warehouseId, String productId, String qty,
            String uom, String sourceType, String sourceId, String externalTransactionId,
            String factVersion, String correlationId, String occurredAt
    ) {
        ObjectNode value = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("tenantId", context.tenantId()).put("transactionNo", transactionNo())
                .put("externalTransactionId", externalTransactionId).put("type", type)
                .put("warehouseId", warehouseId).put("productId", productId).put("qty", qty)
                .put("uom", uom).put("sourceType", sourceType).put("sourceId", sourceId)
                .put("factVersion", Integer.parseInt(factVersion)).put("correlationId", correlationId)
                .put("traceId", context.traceId()).put("occurredAt", occurredAt);
        return value;
    }

    private JsonNode upsertInboundFact(
            FulfillmentStore repository, RequestContext context, JsonNode current, String warehouseId,
            String productId, String qty, String uom, String sourceEventId, String timestamp
    ) {
        String qualified = add(current == null ? "0" : text(current, "qualifiedOnHandQty"), qty);
        String fulfillable = add(current == null ? "0" : text(current, "fulfillableQty"), qty);
        ObjectNode fact = current == null ? mapper.createObjectNode() : current.deepCopy();
        fact.put("tenantId", context.tenantId()).put("warehouseId", warehouseId).put("productId", productId)
                .put("qualifiedOnHandQty", qualified).put("fulfillableQty", fulfillable)
                .put("allocatedReservedQty", current == null ? "0" : text(current, "allocatedReservedQty"))
                .put("frozenQty", current == null ? "0" : text(current, "frozenQty"))
                .put("safetyStockQty", current == null ? "0" : text(current, "safetyStockQty"))
                .put("inTransitQty", current == null ? "0" : text(current, "inTransitQty")).put("uom", uom)
                .put("formulaVersion", "FULFILLABLE-V1")
                .put("factVersion", current == null ? 1 : current.path("factVersion").asInt() + 1)
                .put("sourceSystem", "REFERENCE_WMS").put("sourceEventId", sourceEventId).put("asOf", timestamp);
        return fact;
    }

    private String lineAmount(String qty, String price, String taxRate) {
        BigDecimal base = scaled(qty).multiply(scaled(price))
                .divide(SCALE, 0, java.math.RoundingMode.DOWN);
        return unscaled(base.add(base.multiply(scaled(taxRate))
                .divide(SCALE, 0, java.math.RoundingMode.DOWN)));
    }

    private void applyOutboundToTaskAndSales(
            FulfillmentStore repository, JsonNode outbound, JsonNode postedLines, RequestContext context
    ) {
        JsonNode task = shipmentTaskById(context.tenantId(), text(outbound, "shipmentTaskId")).orElse(null);
        JsonNode request = repository.shipmentRequest(context.tenantId(), text(outbound, "shipmentRequestId")).orElse(null);
        JsonNode order = repository.order(context.tenantId(), text(outbound, "salesOrderId")).orElse(null);
        if (task == null || request == null || order == null) {
            throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "出库回写目标缺失", "检查聚合关联后重试");
        }
        Map<String, String> remainingByOrderLine = new LinkedHashMap<>();
        for (JsonNode line : postedLines) remainingByOrderLine.put(text(line, "orderLineId"), text(line, "postedQty"));
        for (JsonNode reservationValue : repository.reservationsByTask(context.tenantId(), text(task, "id"))) {
            boolean changed = false;
            ObjectNode reservation = reservationValue.deepCopy();
            ArrayNode reservationLines = reservation.withArray("lines");
            for (JsonNode line : reservationLines) {
                String remaining = remainingByOrderLine.getOrDefault(text(line, "orderLineId"), "0");
                String consumable = subtract(text(line, "reservedQty"),
                        add(text(line, "consumedQty"), text(line, "releasedQty")));
                String consumed = min(remaining, consumable);
                if (compare(consumed, "0") <= 0) continue;
                changed = true;
                remainingByOrderLine.put(text(line, "orderLineId"), subtract(remaining, consumed));
                ObjectNode value = (ObjectNode) line;
                value.put("consumedQty", add(text(line, "consumedQty"), consumed));
            }
            if (!changed) continue;
            String consumedQty = streamNodes(reservationLines).map(line -> text(line, "consumedQty"))
                    .reduce("0", this::add);
            boolean fullyConsumed = streamNodes(reservationLines).allMatch(line ->
                    compare(add(text(line, "consumedQty"), text(line, "releasedQty")), text(line, "reservedQty")) == 0);
            ObjectNode updated = nextVersion(reservation, version(reservation) + 1).put("consumedQty", consumedQty);
            if (fullyConsumed) updated.put("status", "CONSUMED");
            repository.saveReservation(updated);
        }
        if (remainingByOrderLine.values().stream().anyMatch(qty -> compare(qty, "0") > 0)) {
            throw conflict("有效预留不足，无法消费出库数量", "核对预留释放和已消费数量后重新校验");
        }
        ObjectNode nextTask = task.deepCopy();
        ArrayNode taskLines = nextTask.withArray("lines");
        for (JsonNode line : taskLines) {
            JsonNode posted = findById(postedLines, text(line, "orderLineId"), "orderLineId");
            if (posted != null) {
                ObjectNode value = (ObjectNode) line;
                value.put("postedQty", add(text(line, "postedQty"), text(posted, "postedQty")));
            }
        }
        boolean requestDone = streamNodes(taskLines).allMatch(line ->
                compare(text(line, "postedQty"), text(line, "requestedQty")) == 0);
        int latestFactVersion = task.path("inventoryFactVersion").asInt();
        for (JsonNode line : taskLines) {
            latestFactVersion = Math.max(latestFactVersion, repository
                    .availability(context.tenantId(), text(task, "warehouseId"), text(line, "productId"))
                    .map(value -> value.path("factVersion").asInt()).orElse(0));
        }
        ObjectNode updatedTask = nextVersion(nextTask, version(task) + 1)
                .put("postingStatus", requestDone ? "POSTED" : "PARTIALLY_POSTED")
                .put("workflowStatus", requestDone ? "COMPLETED" : "ACTIVE")
                .put("inventoryFactVersion", latestFactVersion);
        repository.saveShipmentTask(updatedTask);
        ObjectNode nextRequest = request.deepCopy();
        for (JsonNode line : nextRequest.withArray("lines")) {
            JsonNode taskLine = findById(taskLines, text(line, "id"));
            if (taskLine != null) ((ObjectNode) line).put("postedQty", text(taskLine, "postedQty"));
        }
        ObjectNode updatedRequest = nextVersion(nextRequest, version(request) + 1)
                .put("postingStatus", requestDone ? "POSTED" : "PARTIALLY_POSTED")
                .put("workflowStatus", requestDone ? "COMPLETED" : "ACTIVE");
        repository.saveShipmentRequest(updatedRequest);
        ObjectNode nextOrder = order.deepCopy();
        for (JsonNode line : nextOrder.withArray("lines")) {
            JsonNode posted = findById(postedLines, text(line, "id"), "orderLineId");
            if (posted == null) continue;
            ObjectNode value = (ObjectNode) line;
            String shippedQty = add(text(line, "shippedQty"), text(posted, "postedQty"));
            String remainingQty = subtract(text(line, "orderedQty"), shippedQty);
            String activeQty = subtract(text(line, "activeRequestedQty"), text(posted, "postedQty"));
            String reservedQty = subtract(text(line, "reservedQty"), text(posted, "postedQty"));
            if (compare(remainingQty, "0") < 0 || compare(activeQty, "0") < 0 || compare(reservedQty, "0") < 0) {
                throw conflict("销售订单数量与出库事实不一致", "核对累计已发、活动申请和有效预留");
            }
            value.put("shippedQty", shippedQty).put("remainingQty", remainingQty)
                    .put("activeRequestedQty", activeQty)
                    .put("reservedQty", reservedQty)
                    .put("lineStatus", compare(remainingQty, "0") == 0 ? "SHIPPED" : "PARTIALLY_SHIPPED")
                    .put("version", line.path("version").asInt() + 1);
        }
        boolean allShipped = streamNodes(nextOrder.withArray("lines")).allMatch(line ->
                Set.of("SHIPPED", "CANCELED").contains(text(line, "lineStatus")));
        ObjectNode updatedOrder = nextVersion(nextOrder, version(order) + 1)
                .put("overallStatus", allShipped ? "SHIPPED" : "PARTIALLY_SHIPPED")
                .put("shipmentStatus", allShipped ? "SHIPPED" : "PARTIALLY_SHIPPED");
        repository.saveOrder(updatedOrder);
        audit(repository, context, "SalesOrder", text(order, "id"), version(updatedOrder),
                "APPLY_SALES_OUTBOUND", text(order, "correlationId"), presentOrder(order), presentOrder(updatedOrder), null);
        ObjectNode timelineValue = mapper.createObjectNode()
                .put("eventType", allShipped ? "inventory.sales-outbound.posted.v1"
                        : "inventory.sales-outbound.partially-posted.v1")
                .put("aggregateType", "SalesOutbound").put("aggregateId", text(outbound, "id"))
                .put("status", text(updatedOrder, "overallStatus")).put("occurredAt", now())
                .put("traceId", context.traceId())
                .put("summary", allShipped ? "订单已全部发货" : "订单已部分发货");
        repository.addTimeline(context.tenantId(), text(order, "id"), timelineValue);
    }

    private JsonNode findById(JsonNode lines, String id) {
        return findById(lines, id, "id");
    }

    private JsonNode findById(JsonNode lines, String id, String field) {
        for (JsonNode line : lines) {
            if (text(line, field).equals(id)) return line;
        }
        return null;
    }

    private ObjectNode wrapper(String aggregateType, JsonNode value) {
        String field = switch (aggregateType) {
            case "Warehouse" -> "warehouse";
            case "Product" -> "product";
            case "Material" -> "material";
            case "TransferOrder" -> "transfer";
            case "Stocktake" -> "stocktake";
            default -> aggregateType.toLowerCase();
        };
        return mapper.createObjectNode().set(field, value.deepCopy());
    }

    private String min(String left, String right) {
        return compare(left, right) <= 0 ? left : right;
    }

    private String transactionNo() {
        return "ITX-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    }

    private java.util.stream.Stream<JsonNode> streamNodes(JsonNode value) {
        java.util.Spliterator<JsonNode> spliterator = java.util.Spliterators.spliteratorUnknownSize(
                value.iterator(), java.util.Spliterator.ORDERED);
        return java.util.stream.StreamSupport.stream(spliterator, false);
    }

    private Command command(
            RequestContext context, String commandType, JsonNode input, Function<FulfillmentStore, Command> work
    ) {
        String key = requiredIdempotency(context);
        String requestHash = hash(input);
        return store.transaction(context.tenantId(), repository -> {
            var existing = repository.idempotency(context.tenantId(), commandType, key);
            if (existing.isPresent()) {
                JsonNode record = existing.get();
                if (!record.path("requestHash").asText().equals(requestHash)) {
                    throw conflict("幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                return new Command(record.path("statusCode").asInt(), record.path("body").deepCopy(),
                        etagVersion(record.path("body")), true);
            }
            Command result = work.apply(repository);
            repository.saveIdempotency(context.tenantId(), commandType, key, requestHash,
                    result.statusCode(), result.body());
            return result;
        });
    }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "FULFILLMENT_403_PERMISSION_DENIED", "当前账号没有执行该操作的权限",
                    "联系管理员配置对应业务权限", null,
                    Map.of("permission", permission));
        }
    }

    private JsonNode requireOrder(RequestContext context, String id) {
        return store.order(context.tenantId(), id)
                .orElseThrow(() -> new ApiException(404, "FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试"));
    }

    private void requireReservableSnapshot(RequestContext context, JsonNode task) {
        String requestId = text(task, "shipmentRequestId");
        String orderId = text(task, "salesOrderId");
        if (store.shipmentRequest(context.tenantId(), requestId).isEmpty()
                || store.order(context.tenantId(), orderId).isEmpty()) {
            throw new ApiException(424, "FULFILLMENT_424_DEPENDENCY_FAILED", "发货任务缺少销售履约投影",
                    "修复发货申请和订单关联后重试");
        }
        for (JsonNode line : task.withArray("lines")) {
            for (String field : List.of("id", "orderLineId", "productId", "uom")) {
                if (text(line, field).isBlank()) {
                    throw invalidTaskSnapshot(field + "_required");
                }
            }
            for (String field : List.of("requestedQty", "reservedQty", "postedQty", "shortageQty")) {
                if (!decimalValidText(text(line, field))) {
                    throw invalidTaskSnapshot(field + "_required");
                }
            }
        }
        JsonNode request = store.shipmentRequest(context.tenantId(), requestId).orElseThrow();
        JsonNode order = store.order(context.tenantId(), orderId).orElseThrow();
        if (!orderId.equals(text(request, "salesOrderId"))
                || Set.of("SHIPPED", "CANCELED", "COMPLETED").contains(text(order, "overallStatus"))) {
            throw invalidTaskSnapshot("salesOrderId_or_status_mismatch");
        }
        for (JsonNode line : task.withArray("lines")) {
            JsonNode requestLine = findById(request.withArray("lines"), text(line, "id"));
            JsonNode orderLine = findLineById(order, text(line, "orderLineId"));
            if (requestLine == null || orderLine == null) throw invalidTaskSnapshot("source_line_missing");
            for (String field : List.of("orderLineId", "productId", "requestedQty", "uom", "sourceLineRevision")) {
                if (!text(requestLine, field).equals(text(line, field))) throw invalidTaskSnapshot(field + "_mismatch");
            }
            if (!text(orderLine, "productId").equals(text(line, "productId"))
                    || !text(orderLine, "uom").equals(text(line, "uom"))
                    || compare(text(line, "postedQty"), text(line, "reservedQty")) > 0
                    || compare(text(line, "reservedQty"), text(line, "requestedQty")) > 0) {
                throw invalidTaskSnapshot("product_uom_or_quantity_mismatch");
            }
        }
    }

    private void requirePostInput(JsonNode input) {
        if (input == null || !input.path("lines").isArray() || input.path("lines").isEmpty()
                || input.path("lines").size() > 200) {
            throw badRequest("lines 必须包含 1 到 200 行", List.of(new ApiException.FieldError("lines", "invalid_count")));
        }
        try {
            Instant.parse(text(input, "shippedAt"));
        } catch (java.time.DateTimeException exception) {
            throw badRequest("shippedAt 必须是有效时间", List.of(new ApiException.FieldError("shippedAt", "invalid_datetime")));
        }
        Set<String> seen = new java.util.HashSet<>();
        for (JsonNode line : input.path("lines")) {
            if (text(line, "outboundLineId").isBlank() || !seen.add(text(line, "outboundLineId"))) {
                throw badRequest("出库行不能为空或重复", List.of(new ApiException.FieldError("lines", "duplicate_or_missing_line")));
            }
            requireDecimal(line, "qty", true);
            requireText(line, "uom", 20, true);
        }
    }

    private ApiException invalidTaskSnapshot(String field) {
        return new ApiException(422, "FULFILLMENT_422_TASK_SNAPSHOT_INVALID", "仓库发货任务数据不完整",
                "刷新任务后重试；若持续失败，请修复任务快照",
                List.of(new ApiException.FieldError("lines", field)), Map.of("field", field));
    }

    private boolean decimalValidText(String value) {
        try {
            new BigDecimal(value);
            return true;
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    private void requireVersion(RequestContext context, int actual) {
        Integer expected = context.expectedVersion();
        if (expected == null) {
            throw new ApiException(409, "FULFILLMENT_409_VERSION_CONFLICT", "缺少聚合版本",
                    "刷新数据并携带最新 If-Match 后重试", null, Map.of("actualVersion", actual));
        }
        if (expected != actual) {
            throw new ApiException(409, "FULFILLMENT_409_VERSION_CONFLICT", "数据已被其他操作更新",
                    "刷新数据后重新确认操作", null, Map.of("expectedVersion", expected, "actualVersion", actual));
        }
    }

    private String requiredIdempotency(RequestContext context) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw badRequest("写操作缺少幂等键", List.of(new ApiException.FieldError("X-Idempotency-Key", "required")));
        }
        return context.idempotencyKey();
    }

    private int requiredVersion(RequestContext context) {
        if (context.expectedVersion() == null) {
            throw new ApiException(409, "FULFILLMENT_409_VERSION_CONFLICT", "缺少聚合版本",
                    "刷新数据并携带最新 If-Match 后重试");
        }
        return context.expectedVersion();
    }

    private void validateOrder(JsonNode input, boolean patch) {
        validateCommercialMetadata(input);
        for (String field : List.of("discountRate", "discountAmount", "expectedTotalAmount")) {
            if (!input.has(field)) continue;
            requireDecimal(input, field, false);
            if ("discountRate".equals(field) && new BigDecimal(text(input, field)).compareTo(BigDecimal.valueOf(100)) > 0) {
                throw badRequest("折扣率必须在 0% 到 100% 之间",
                        List.of(new ApiException.FieldError(field, "out_of_range")));
            }
        }
        requireText(input, "customerId", 100, !patch);
        requireText(input, "ownerEmployeeId", 100, !patch);
        requireText(input, "fulfillmentWarehouseId", 100, !patch);
        requireText(input, "factoryResourceId", 100, !patch);
        requireDate(input, "requestedDeliveryDate", !patch);
        if (!patch && !input.hasNonNull("allowPartialShipment")) {
            throw badRequest("allowPartialShipment 必填", List.of(new ApiException.FieldError("allowPartialShipment", "required")));
        }
        if (input.hasNonNull("currency") && !text(input, "currency").matches("[A-Z]{3}")) {
            throw badRequest("currency 必须是三位大写字母", List.of(new ApiException.FieldError("currency", "invalid")));
        }
        if (!patch && !input.hasNonNull("currency")) {
            throw badRequest("currency 必填", List.of(new ApiException.FieldError("currency", "required")));
        }
        if (!patch && !input.hasNonNull("recipient")) {
            throw badRequest("recipient 必填", List.of(new ApiException.FieldError("recipient", "required")));
        }
        if (input.hasNonNull("recipient")) validateRecipient(input.get("recipient"));
        JsonNode lines = input.path("lines");
        if ((!patch || input.has("lines")) && (!lines.isArray() || lines.isEmpty())) {
            throw badRequest("lines 至少包含一行", List.of(new ApiException.FieldError("lines", "min_length")));
        }
        if (lines.size() > 200) {
            throw badRequest("lines 最多 200 行", List.of(new ApiException.FieldError("lines", "max_length")));
        }
        for (JsonNode line : lines) validateLine(line);
    }

    private void validateOrderPatch(JsonNode input) {
        validateOrder(input, true);
        for (String field : List.of("customerId", "currency", "sourceQuoteId", "sourceQuoteRevision")) {
            if (input.has(field)) {
                throw badRequest(field + " 不允许修改", List.of(new ApiException.FieldError(field, "immutable")));
            }
        }
    }

    private void validateRecipient(JsonNode input) {
        requireText(input, "name", 100, true);
        requireText(input, "phone", 40, true);
        requireText(input, "country", 80, true);
        requireText(input, "province", 80, true);
        requireText(input, "city", 80, true);
        requireText(input, "district", 80, false);
        requireText(input, "address", 500, true);
        requireText(input, "postalCode", 20, false);
    }

    private void validateLine(JsonNode input) {
        requireOptionalString(input, "productName", 200);
        requireOptionalString(input, "specification", 200);
        if (input.path("lineNo").asInt(-1) < 1) {
            throw badRequest("lineNo 必须大于 0", List.of(new ApiException.FieldError("lineNo", "invalid")));
        }
        requireText(input, "productId", 100, true);
        requireDecimal(input, "orderedQty", true);
        requireText(input, "uom", 20, true);
        requireDecimal(input, "unitPrice", true);
        requireDecimal(input, "taxRate", false);
        requireDate(input, "promisedDate", true);
        if (!input.hasNonNull("allowPartialShipment")) {
            throw badRequest("allowPartialShipment 必填", List.of(new ApiException.FieldError("allowPartialShipment", "required")));
        }
    }

    private void validateCommercialMetadata(JsonNode input) {
        for (String field : List.of("orderDate", "validUntil")) {
            if (!input.has(field)) continue;
            JsonNode value = input.get(field);
            try {
                if (!value.isTextual() || !value.asText().matches("\\d{4}-\\d{2}-\\d{2}")) {
                    throw new java.time.DateTimeException("Invalid date");
                }
                LocalDate.parse(value.asText());
            } catch (java.time.DateTimeException exception) {
                throw badRequest(field + " 必须是有效日期",
                        List.of(new ApiException.FieldError(field, "invalid_date")));
            }
        }
        if (input.hasNonNull("orderDate") && input.hasNonNull("validUntil")
                && text(input, "validUntil").compareTo(text(input, "orderDate")) < 0) {
            throw badRequest("有效期不能早于订单日期",
                    List.of(new ApiException.FieldError("validUntil", "before_order_date")));
        }
        requireOptionalString(input, "remark", 1000);
    }

    private void requireOptionalString(JsonNode input, String field, int max) {
        if (!input.has(field)) return;
        JsonNode value = input.get(field);
        if (!value.isTextual() || value.asText().length() > max) {
            throw badRequest(field + " 必须是最多 " + max + " 字的文本",
                    List.of(new ApiException.FieldError(field, "invalid_text")));
        }
    }

    private ObjectNode recipient(RequestContext context, String orderId, JsonNode input) {
        ObjectNode value = input.deepCopy();
        String phone = text(input, "phone");
        value.remove("phone");
        EncryptedValue encrypted = encrypt(context.tenantId(), orderId, phone);
        value.put("phoneMasked", maskPhone(phone)).put("phoneCiphertext", encrypted.ciphertext())
                .put("phoneKeyId", encrypted.keyId());
        return value;
    }

    private EncryptedValue encrypt(String tenantId, String aggregateId, String plaintext) {
        try {
            byte[] iv = new byte[12];
            new java.security.SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(dataKey, "AES"), new GCMParameterSpec(128, iv));
            String associated = String.join(":", tenantId, "SalesOrder", aggregateId, "recipient.phone");
            cipher.updateAAD(associated.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return new EncryptedValue(Base64.getEncoder().encodeToString(payload), dataKeyId);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to encrypt fulfillment phone", exception);
        }
    }

    private String maskPhone(String phone) {
        String value = phone.trim();
        if (value.length() <= 7) return value.substring(0, 2) + "***" + value.substring(value.length() - 2);
        return value.substring(0, 3) + "****" + value.substring(value.length() - 4);
    }

    private void requireUniqueLineNumbers(JsonNode input) {
        Set<String> values = numbers(input.withArray("lines"));
        if (values.size() != input.withArray("lines").size()) {
            throw badRequest("订单行号不能重复", List.of(new ApiException.FieldError("lines", "duplicate_line_no")));
        }
    }

    private void requireDeliveryDates(String requestedDate, JsonNode lines) {
        if (requestedDate.compareTo(today()) < 0) {
            throw badRequest("承诺交期不能早于订单日期",
                    List.of(new ApiException.FieldError("requestedDeliveryDate", "past_date")));
        }
        for (JsonNode line : lines) {
            if (text(line, "promisedDate").compareTo(requestedDate) < 0) {
                throw badRequest("承诺交期不能早于订单日期",
                        List.of(new ApiException.FieldError("requestedDeliveryDate", "past_date")));
            }
        }
    }

    private JsonNode presentOrder(JsonNode order) {
        ObjectNode value = order.deepCopy();
        ObjectNode recipient = value.path("recipient").isObject()
                ? (ObjectNode) value.get("recipient")
                : value.putObject("recipient");
        recipient.remove("phoneCiphertext");
        recipient.remove("phoneKeyId");
        return value;
    }

    private void audit(
            FulfillmentStore repository, RequestContext context, String aggregateType, String aggregateId,
            int aggregateVersion, String action, String correlationId, JsonNode before, JsonNode after, String reason
    ) {
        ObjectNode value = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                .put("tenantId", context.tenantId()).put("aggregateType", aggregateType)
                .put("aggregateId", aggregateId).put("aggregateVersion", aggregateVersion).put("action", action)
                .put("actorId", context.actorId()).put("permissionVersion", "unknown")
                .put("correlationId", correlationId == null ? UUID.randomUUID().toString() : correlationId)
                .put("traceId", context.traceId()).put("ipAddress", "").put("userAgent", "").put("occurredAt", now());
        if (before != null) value.set("beforeSnapshot", before);
        if (after != null) value.set("afterSnapshot", after);
        if (reason != null) value.put("reason", reason);
        repository.addAudit(value);
    }

    private void timeline(
            FulfillmentStore repository, String eventType, String aggregateType, String aggregateId, String status,
            RequestContext context, String timelineOrderId, String summary
    ) {
        ObjectNode value = mapper.createObjectNode().put("eventType", eventType).put("aggregateType", aggregateType)
                .put("aggregateId", aggregateId).put("status", status).put("occurredAt", now())
                .put("traceId", context.traceId());
        if (summary != null) value.put("summary", summary);
        repository.addTimeline(context.tenantId(), timelineOrderId, value);
    }

    private void outbox(
            FulfillmentStore repository, RequestContext context, String eventType, String aggregateType,
            String aggregateId, int aggregateVersion, String correlationId, Map<String, Object> payload
    ) {
        ObjectNode value = mapper.createObjectNode().put("eventId", UUID.randomUUID().toString())
                .put("tenantId", context.tenantId()).put("eventType", eventType).put("eventVersion", 1).put("aggregateType", aggregateType)
                .put("aggregateId", aggregateId).put("aggregateVersion", aggregateVersion)
                .put("correlationId", correlationId).put("traceId", context.traceId())
                .put("status", "PENDING").put("attempts", 0).put("createdAt", now()).put("occurredAt", now());
        ObjectNode payloadNode = value.putObject("payload");
        payload.forEach(payloadNode::putPOJO);
        repository.addOutbox(context.tenantId(), text(value, "eventId"), value);
    }

    private String orderTotal(JsonNode lines) {
        BigDecimal total = BigDecimal.ZERO;
        for (JsonNode line : lines) {
            BigDecimal quantity = scaled(text(line, "orderedQty"));
            BigDecimal price = scaled(text(line, "unitPrice"));
            BigDecimal taxRate = scaled(text(line, "taxRate"));
            BigDecimal base = quantity.multiply(price).divide(SCALE, 0, java.math.RoundingMode.DOWN);
            total = total.add(base.add(base.multiply(taxRate).divide(SCALE, 0, java.math.RoundingMode.DOWN)));
        }
        return unscaled(total);
    }

    private void setOrderPricing(ObjectNode order, JsonNode input, JsonNode lines) {
        String originalAmount = orderTotal(lines);
        String discountRate = text(input, "discountRate", text(order, "discountRate", "100"));
        String discountAmount = text(input, "discountAmount", text(order, "discountAmount", "0"));
        BigDecimal total = new BigDecimal(originalAmount).multiply(new BigDecimal(discountRate))
                .divide(BigDecimal.valueOf(100)).subtract(new BigDecimal(discountAmount))
                .max(BigDecimal.ZERO).setScale(2, java.math.RoundingMode.HALF_UP);
        if (input.has("expectedTotalAmount")
                && new BigDecimal(text(input, "expectedTotalAmount")).compareTo(total) != 0) {
            throw new ApiException(422, "FULFILLMENT_422_PRICE_MISMATCH",
                    "订单金额与产品明细和优惠不一致", "核对单价、数量、折扣率和优惠金额后重试", null,
                    Map.of("expectedTotalAmount", text(input, "expectedTotalAmount"),
                            "calculatedTotalAmount", total.toPlainString()));
        }
        order.put("originalAmount", originalAmount).put("discountRate", discountRate)
                .put("discountAmount", discountAmount)
                .put("totalAmount", total.stripTrailingZeros().toPlainString());
    }

    private BigDecimal scaled(String value) {
        return new BigDecimal(value).multiply(SCALE);
    }

    private String add(String left, String right) {
        return unscaled(scaled(left).add(scaled(right)));
    }

    private String subtract(String left, String right) {
        return unscaled(scaled(left).subtract(scaled(right)));
    }

    private int compare(String left, String right) {
        return scaled(left).compareTo(scaled(right));
    }

    private boolean decimalValid(JsonNode input, String field) {
        JsonNode value = input.get(field);
        return value != null && value.isTextual() && value.asText().matches(DECIMAL_PATTERN)
                && new BigDecimal(value.asText()).signum() > 0;
    }

    private String unscaled(BigDecimal value) {
        BigDecimal whole = value.divideToIntegralValue(SCALE);
        BigDecimal fraction = value.remainder(SCALE).abs();
        String fractionText = fraction.toBigInteger().toString();
        while (fractionText.length() < 6) fractionText = "0" + fractionText;
        fractionText = fractionText.replaceAll("0+$", "");
        return whole.toBigInteger().toString() + (fractionText.isBlank() ? "" : "." + fractionText);
    }

    private String hash(JsonNode value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = mapper.writeValueAsBytes(sorted(value));
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash idempotent request", exception);
        }
    }

    private JsonNode sorted(JsonNode value) {
        if (value instanceof ObjectNode object) {
            Map<String, JsonNode> values = new TreeMap<>();
            object.fields().forEachRemaining(entry -> values.put(entry.getKey(), sorted(entry.getValue())));
            ObjectNode result = mapper.createObjectNode();
            values.forEach(result::set);
            return result;
        }
        if (value instanceof ArrayNode array) {
            ArrayNode result = mapper.createArrayNode();
            array.forEach(item -> result.add(sorted(item)));
            return result;
        }
        return value;
    }

    private ObjectNode nextVersion(JsonNode current, int version) {
        ObjectNode value = current.deepCopy();
        value.put("version", version).put("updatedAt", now());
        return value;
    }

    private void copyPatch(ObjectNode target, JsonNode patch, String... fields) {
        for (String field : fields) {
            if (patch.hasNonNull(field)) target.set(field, patch.get(field).deepCopy());
        }
    }

    private JsonNode findLine(JsonNode order, String lineNo) {
        JsonNode lines = order.has("lines") ? order.get("lines") : order;
        for (JsonNode line : lines) {
            if (text(line, "lineNo").equals(lineNo)) return line;
        }
        return null;
    }

    private JsonNode findLineById(JsonNode order, String id) {
        JsonNode lines = order.has("lines") ? order.get("lines") : order;
        for (JsonNode line : lines) {
            if (text(line, "id").equals(id)) return line;
        }
        return null;
    }

    private Set<String> numbers(JsonNode lines) {
        Set<String> values = new java.util.HashSet<>();
        lines.forEach(line -> values.add(text(line, "lineNo")));
        return values;
    }

    private String etagVersion(JsonNode body) {
        if (body.hasNonNull("version")) return body.get("version").asText();
        if (body.hasNonNull("task")) return body.path("task").path("version").asText();
        if (body.hasNonNull("outbound")) return body.path("outbound").path("version").asText();
        return null;
    }

    private void requireStatus(
            JsonNode value, String statusField, String expected, String secondField, String secondExpected
    ) {
        if (!text(value, statusField).equals(expected) || !text(value, secondField).equals(secondExpected)) {
            throw conflict("当前聚合状态不允许该操作", "刷新聚合状态后重试");
        }
    }

    private void requireStatus(JsonNode value, String field, String... allowed) {
        if (!Set.of(allowed).contains(text(value, field))) {
            throw conflict("当前聚合状态不允许该操作", "刷新聚合状态后重试");
        }
    }

    private void requireText(JsonNode input, String field, int max, boolean required) {
        boolean missing = !input.hasNonNull(field) || text(input, field).isBlank();
        if (missing && required) {
            throw badRequest(field + " 必填", List.of(new ApiException.FieldError(field, "required")));
        }
        if (!missing && text(input, field).length() > max) {
            throw badRequest(field + " 最长 " + max + " 字", List.of(new ApiException.FieldError(field, "too_long")));
        }
    }

    private void requireDecimal(JsonNode input, String field, boolean positive) {
        JsonNode value = input.get(field);
        if (value == null || value.isNull() || !value.isTextual() || !value.asText().matches(DECIMAL_PATTERN)) {
            throw badRequest(field + " 必须是不超过 6 位小数的数字字符串",
                    List.of(new ApiException.FieldError(field, "invalid_decimal")));
        }
        if (positive && new BigDecimal(value.asText()).compareTo(BigDecimal.ZERO) <= 0) {
            throw badRequest(field + " 必须大于 0", List.of(new ApiException.FieldError(field, "positive_decimal")));
        }
    }

    private void requireDate(JsonNode input, String field, boolean required) {
        boolean missing = !input.hasNonNull(field) || text(input, field).isBlank();
        if (missing) {
            if (required) throw badRequest(field + " 必填", List.of(new ApiException.FieldError(field, "required")));
            return;
        }
        if (!text(input, field).matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw badRequest(field + " 必须是 YYYY-MM-DD", List.of(new ApiException.FieldError(field, "invalid_date")));
        }
    }

    private ApiException badRequest(String message, List<ApiException.FieldError> fields) {
        return new ApiException(400, "FULFILLMENT_400_INVALID_ARGUMENT", message, "检查请求字段后重试", fields, null);
    }

    private ApiException conflict(String message, String suggestion) {
        return new ApiException(409, "FULFILLMENT_409_ILLEGAL_STATE", message, suggestion);
    }

    private int version(JsonNode value) { return value.path("version").asInt(); }

    private String text(JsonNode value, String field) { return FulfillmentStore.text(value, field); }

    private String text(JsonNode value, String field, String fallback) {
        return value.hasNonNull(field) ? value.get(field).asText() : fallback;
    }

    private String optionalText(JsonNode value, String field) {
        return value == null || value.get(field) == null || value.get(field).isNull() ? "" : value.get(field).asText();
    }

    private void copyIfPresent(ObjectNode target, JsonNode source, String... fields) {
        for (String field : fields) {
            if (source.hasNonNull(field)) target.set(field, source.get(field).deepCopy());
        }
    }

    private String now() { return Instant.now().toString(); }

    private String today() { return LocalDate.now(ZoneOffset.UTC).toString(); }
}
