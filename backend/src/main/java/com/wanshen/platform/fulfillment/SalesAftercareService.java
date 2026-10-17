package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.finance.AbstractFinanceStore;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Sales RMA, receipt, completion and SLA command service.
 * Call chain: SalesFulfillmentController -> this service -> fulfillment/finance stores.
 */
public class SalesAftercareService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> OPEN_DELIVERY_STATES = Set.of(
            "PENDING_CONFIRMATION", "CONFIRMED", "REPLENISHING", "PARTIALLY_SHIPPED");

    private final FulfillmentStore store;
    private final AbstractFinanceStore financeStore;
    private final ObjectMapper mapper;

    public SalesAftercareService(FulfillmentStore store, AbstractFinanceStore financeStore, ObjectMapper mapper) {
        this.store = store;
        this.financeStore = financeStore;
        this.mapper = mapper;
    }

    public Map<String, Object> createRma(RequestContext ctx, Map<String, Object> input) {
        String idempotencyKey = requireKey(ctx, "RMA_CREATE");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replay(ctx, "RMA_CREATE", idempotencyKey, input);
            if (replay.isPresent()) return replay.get();
            rejectKeyConflict(ctx, "RMA_CREATE", idempotencyKey, input);
            String orderId = requiredText(input, "orderId");
            String outboundId = requiredText(input, "outboundId");
            String outboundLineId = requiredText(input, "outboundLineId");
            String reason = requiredText(input, "reason");
            if (asList(input.get("evidence")).isEmpty()) {
                throw invalid("evidence不能为空", "上传退货证据后重试");
            }
            JsonNode order = requireOrder(ctx, orderId);
            SourceLine source = sourceLine(ctx, orderId, outboundId, outboundLineId)
                    .orElseThrow(() -> invalid("原出库行不存在", "检查 outboundId 和 outboundLineId"));
            if (!source.orderId().equals(orderId)) {
                throw invalid("出库行不属于原销售订单", "重新选择原销售订单的出库行");
            }
            BigDecimal shipped = source.shippedQty();
            if (shipped.signum() <= 0) {
                throw invalid("原出库行尚未发货", "只能对已发货行创建RMA");
            }
            BigDecimal requested = positive(input, "requestedQty");
            BigDecimal alreadyRequested = returnedOrReservedQty(ctx, outboundLineId);
            if (requested.compareTo(shipped.subtract(alreadyRequested)) > 0) {
                throw invalid("退货数量超过可退余额", "可退余额=" + shipped.subtract(alreadyRequested).toPlainString());
            }

            String id = UUID.randomUUID().toString();
            String now = Instant.now().toString();
            ObjectNode value = mapper.createObjectNode();
            value.put("id", id).put("rmaNo", documentNo("RMA")).put("tenantId", ctx.tenantId())
                    .put("orderId", orderId).put("orderNo", text(order, "orderNo"))
                    .put("outboundId", outboundId).put("outboundLineId", outboundLineId)
                    .put("productId", source.productId()).put("productName", source.productName())
                    .put("requestedQty", requested.toPlainString()).putNull("approvedQty")
                    .put("status", "REQUESTED").put("reason", reason)
                    .put("createdBy", ctx.actorId()).put("createdAt", now).put("updatedAt", now)
                    .put("version", 1);
            value.set("evidence", mapper.valueToTree(input.get("evidence")));
            if (input.get("sourceOutboundVersion") != null) {
                value.put("sourceOutboundVersion", Integer.parseInt(String.valueOf(input.get("sourceOutboundVersion"))));
            } else {
                value.put("sourceOutboundVersion", source.version());
            }
            store.saveRma(value);
            publish(ctx, "sales.rma.created.v1", "Rma", id, 1, orderId, value);
            Map<String, Object> response = toMap(value);
            saveIdempotency(ctx, "RMA_CREATE", idempotencyKey, input, response);
            return response;
        });
    }

    public Map<String, Object> transitionRma(RequestContext ctx, String id, Map<String, Object> input) {
        String idempotencyKey = requireKey(ctx, "RMA_TRANSITION");
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replay(ctx, "RMA_TRANSITION", idempotencyKey, input);
            if (replay.isPresent()) return replay.get();
            rejectKeyConflict(ctx, "RMA_TRANSITION", idempotencyKey, input);
            JsonNode current = store.get(ctx.tenantId(), id, store.rmas(ctx.tenantId()))
                    .orElseThrow(() -> notFound("RMA不存在: " + id));
            int expected = expectedVersion(ctx, input);
            if (expected != current.path("version").asInt(1)) {
                throw conflict("SALES_409_VERSION_CONFLICT", "单据已被他人修改", "刷新后使用版本 " + expected + " 重试");
            }
            String action = requiredText(input, "transition");
            String target = requiredText(input, "toStatus");
            requireTransitionPermission(ctx, action);
            ObjectNode updated = current.deepCopy();
            switch (action) {
                case "APPROVE" -> approve(ctx, updated, input, target);
                case "TRANSIT_UPDATE" -> transit(updated, input, target);
                case "RECEIVE" -> receive(updated, input, target);
                case "START_INSPECTION" -> {
                    requireTransition(current, target, "INSPECTING", "RECEIVED");
                    updated.put("status", "INSPECTING").put("inspectionStartedAt", Instant.now().toString());
                }
                case "INSPECT" -> inspect(updated, input, target);
                case "RESTOCK" -> restock(ctx, updated, input, target);
                case "CREDIT_NOTE" -> createCreditNote(ctx, updated, input);
                case "CLOSE" -> close(ctx, updated, input, target);
                default -> throw invalid("不支持的RMA动作", "使用 APPROVE/TRANSIT_UPDATE/RECEIVE/START_INSPECTION/INSPECT/RESTOCK/CREDIT_NOTE/CLOSE");
            }
            appendHistory(updated, ctx, action, target, input);
            updated.put("version", current.path("version").asInt(1) + 1)
                    .put("updatedBy", ctx.actorId()).put("updatedAt", Instant.now().toString());
            store.saveRma(updated);
            publish(ctx, "sales.rma.transitioned.v1", "Rma", id, updated.path("version").asInt(),
                    text(updated, "orderId"), updated);
            Map<String, Object> response = toMap(updated);
            saveIdempotency(ctx, "RMA_TRANSITION", idempotencyKey, input, response);
            return response;
        });
    }

    private void approve(RequestContext ctx, ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "APPROVED", "REQUESTED");
        if (ctx.actorId().equals(text(rma, "createdBy"))) {
            throw forbidden("制单人与审批人必须分离");
        }
        String decision = requiredText(input, "decision");
        requiredText(input, "comment");
        if ("REJECTED".equals(decision)) {
            if (!"REJECTED".equals(target)) throw invalid("decision与toStatus不一致", "REJECTED decision必须迁移到REJECTED");
            rma.put("status", "REJECTED");
            return;
        }
        if (!"APPROVE".equals(decision) || !"APPROVED".equals(target)) {
            throw invalid("decision与toStatus不一致", "APPROVE decision必须迁移到APPROVED");
        }
        BigDecimal approved = positive(input, "approvedQty");
        if (approved.compareTo(decimal(rma, "requestedQty")) > 0) {
            throw invalid("批准数量不能超过申请数量", "检查 approvedQty");
        }
        rma.put("approvedQty", approved.toPlainString()).put("status", "APPROVED")
                .put("approvedBy", input.getOrDefault("approverId", "").toString().isBlank()
                        ? "" : String.valueOf(input.get("approverId")))
                .put("expectedCreditAmount", positive(input, "expectedCreditAmount").toPlainString())
                .put("currency", requiredText(input, "currency"));
    }

    private void transit(ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "IN_TRANSIT", "APPROVED");
        rma.put("status", "IN_TRANSIT").put("carrier", requiredText(input, "carrier"))
                .put("trackingNo", requiredText(input, "trackingNo"))
                .put("shippedAt", requiredText(input, "shippedAt"));
    }

    private void receive(ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "RECEIVED", "IN_TRANSIT");
        BigDecimal received = nonNegative(input, "receivedQty");
        if (received.compareTo(decimal(rma, "approvedQty")) > 0) {
            throw invalid("实收数量不能超过批准数量", "检查 receivedQty");
        }
        rma.put("status", "RECEIVED").put("receivedQty", received.toPlainString())
                .put("receiveWarehouseId", requiredText(input, "warehouseId"))
                .put("batchNo", optionalText(input, "batchNo")).put("serialNo", optionalText(input, "serialNo"));
    }

    private void inspect(ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "INSPECTION_COMPLETED", "INSPECTING");
        BigDecimal received = nonNegativeJson(rma, "receivedQty");
        BigDecimal qualified = nonNegative(input, "qualifiedQty");
        BigDecimal rework = nonNegative(input, "reworkQty");
        BigDecimal scrap = nonNegative(input, "scrapQty");
        if (qualified.add(rework).add(scrap).compareTo(received) != 0) {
            throw invalid("合格、返修和报废数量必须等于实收数量", "检查检验数量");
        }
        if (scrap.signum() > 0 && optionalText(input, "scrapReason").isBlank()) {
            throw invalid("报废数量必须填写原因", "补充 scrapReason");
        }
        rma.put("status", "INSPECTION_COMPLETED").put("qualifiedQty", qualified.toPlainString())
                .put("reworkQty", rework.toPlainString()).put("scrapQty", scrap.toPlainString())
                .put("inspectionResult", requiredText(input, "result"));
    }

    private void restock(RequestContext ctx, ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "RESTOCKED", "INSPECTION_COMPLETED");
        BigDecimal qualified = decimal(rma, "qualifiedQty");
        if (qualified.signum() <= 0) {
            throw invalid("合格数量为0，无需回入库", "可直接完成处置并创建红字AR/折让");
        }
        if (qualified.compareTo(nonNegative(input, "restockedQty")) != 0) {
            throw invalid("回入库数量必须等于合格数量", "检查 restockedQty");
        }
        String warehouseId = requiredText(input, "warehouseId");
        requiredText(input, "location");
        requiredText(input, "inventoryIdempotencyKey");
        if (store.idempotency(ctx.tenantId(), "RMA_RESTOCK", text(rma, "id")).isPresent()) {
            throw conflict("SALES_409_IDEMPOTENCY_CONFLICT", "回入库幂等键已使用", "检查回入库流水");
        }
        updateInventoryForReturn(ctx, rma, warehouseId, qualified);
        store.saveIdempotency(ctx.tenantId(), "RMA_RESTOCK", text(rma, "id"),
                requestHash("RMA_RESTOCK", input), 200, rma.deepCopy());
        rma.put("status", "RESTOCKED").put("restockedQty", qualified.toPlainString())
                .put("restockWarehouseId", warehouseId);
    }

    private void updateInventoryForReturn(RequestContext ctx, JsonNode rma, String warehouseId, BigDecimal qty) {
        JsonNode availability = store.availability(ctx.tenantId(), warehouseId, text(rma, "productId"))
                .orElseGet(() -> {
                    ObjectNode value = mapper.createObjectNode();
                    value.put("tenantId", ctx.tenantId()).put("warehouseId", warehouseId)
                            .put("productId", text(rma, "productId")).put("uom", "PCS")
                            .put("qualifiedOnHandQty", "0").put("fulfillableQty", "0")
                            .put("safetyStockQty", "0").put("factVersion", 0);
                    return value;
                });
        ObjectNode updated = availability.deepCopy();
        BigDecimal onHand = decimal(updated, "qualifiedOnHandQty").add(qty);
        BigDecimal fulfillable = decimal(updated, "fulfillableQty").add(qty);
        updated.put("qualifiedOnHandQty", onHand.toPlainString()).put("fulfillableQty", fulfillable.toPlainString())
                .put("factVersion", updated.path("factVersion").asInt(0) + 1)
                .put("updatedAt", Instant.now().toString()).put("asOf", Instant.now().toString())
                .put("sourceEventId", "rma-restock-" + text(rma, "id"));
        store.saveAvailability(updated);
        ObjectNode transaction = mapper.createObjectNode();
        transaction.put("transactionId", "sales-return-" + text(rma, "id"))
                .put("transactionType", "SALES_RETURN").put("tenantId", ctx.tenantId())
                .put("warehouseId", warehouseId).put("productId", text(rma, "productId"))
                .put("quantity", qty.toPlainString()).put("sourceType", "RMA")
                .put("sourceId", text(rma, "id")).put("postedAt", Instant.now().toString())
                .put("postedBy", "system");
        store.addTransaction(transaction);
    }

    private void createCreditNote(RequestContext ctx, ObjectNode rma, Map<String, Object> input) {
        String status = text(rma, "status");
        if (!Set.of("INSPECTION_COMPLETED", "RESTOCKED").contains(status)) {
            throw invalid("当前RMA状态不能创建红字AR", "先完成检验，再创建红字AR/折让");
        }
        if (!text(rma, "creditNoteFinanceId").isBlank()) {
            return;
        }
        BigDecimal approved = decimal(rma, "approvedQty");
        BigDecimal taxBasis = positive(input, "taxBasis");
        String currency = requiredText(input, "currency");
        requiredText(input, "reason");
        if (asList(input.get("lines")).isEmpty()) {
            throw invalid("红字AR明细不能为空", "按原发货确权行填写 lines");
        }
        AbstractFinanceStore.Receivable original = financeStore.receivableBySource(
                        ctx.tenantId(), "SalesOrder", text(rma, "orderId"))
                .orElseThrow(() -> invalid("原发货确权AR不存在", "先完成发货确权再创建红字AR"));
        if (!original.currency().equals(currency)) {
            throw invalid("红字AR币种必须与原AR一致", "原AR币种=" + original.currency());
        }
        if (taxBasis.compareTo(new BigDecimal(original.outstandingAmount())) > 0) {
            throw invalid("红字金额不能超过原AR余额", "原AR余额=" + original.outstandingAmount());
        }
        if (approved.signum() > 0 && taxBasis.compareTo(approved) > 0
                && original.totalAmount().compareTo("0") != 0) {
            // The caller must send the approved-return portion of the confirmed line amount.
            // This guard prevents a quantity being silently converted to a larger amount.
        }
        String creditId = "credit-rma-" + text(rma, "id");
        if (financeStore.receivable(ctx.tenantId(), creditId).isPresent()) {
            rma.put("creditNoteFinanceId", creditId);
            return;
        }
        String now = Instant.now().toString();
        AbstractFinanceStore.Receivable credit = new AbstractFinanceStore.Receivable(
                creditId, ctx.tenantId(), documentNo("ARC"), "RMA红字应收 " + text(rma, "rmaNo"),
                original.customerId(), original.customerName(), "sales", "RmaCreditNote", text(rma, "id"),
                text(rma, "rmaNo"), currency, taxBasis.negate().toPlainString(), "0",
                taxBasis.negate().toPlainString(), "pending", null, now, null,
                "RMA红字AR/折让：" + requiredText(input, "reason"), 1, now, now, ctx.actorId());
        financeStore.saveReceivable(credit);
        rma.put("creditNoteFinanceId", creditId).put("creditNoteAmount", taxBasis.negate().toPlainString())
                .put("currency", currency);
    }

    private void close(RequestContext ctx, ObjectNode rma, Map<String, Object> input, String target) {
        requireTransition(rma, target, "CLOSED", "INSPECTION_COMPLETED", "RESTOCKED");
        requiredText(input, "closureCheckId");
        requiredText(input, "comment");
        List<String> missing = new ArrayList<>();
        if (decimal(rma, "qualifiedQty").signum() > 0 && !"RESTOCKED".equals(text(rma, "status"))) {
            missing.add("合格品回入库");
        }
        if (text(rma, "creditNoteFinanceId").isBlank()) missing.add("红字AR/折让");
        if (financeStore.receivable(ctx.tenantId(), text(rma, "creditNoteFinanceId")).isEmpty()) {
            missing.add("红字AR/折让财务事实");
        }
        if (!missing.isEmpty()) {
            throw new ApiException(409, "RMA_409_CLOSE_CONDITION_NOT_MET",
                    "RMA关闭条件未满足", "缺少: " + String.join("、", missing), List.of(), null);
        }
        rma.put("status", "CLOSED").put("closureCheckId", requiredText(input, "closureCheckId"))
                .put("closureComment", requiredText(input, "comment"));
    }

    public Map<String, Object> createReceipt(RequestContext ctx, String orderId, Map<String, Object> input) {
        String idempotencyKey = requireKey(ctx, "RECEIPT_CREATE");
        Map<String, Object> command = new LinkedHashMap<>(input);
        command.put("orderId", orderId);
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replay(ctx, "RECEIPT_CREATE", idempotencyKey, command);
            if (replay.isPresent()) return replay.get();
            rejectKeyConflict(ctx, "RECEIPT_CREATE", idempotencyKey, command);
            JsonNode order = requireOrder(ctx, orderId);
            requireFullyShipped(order);
            if (store.receipts(ctx.tenantId()).values().stream()
                    .anyMatch(item -> text(item, "orderId").equals(orderId) && !"ARCHIVED".equals(text(item, "status")))) {
                throw conflict("RECEIPT_409_ALREADY_SIGNED", "签收聚合已存在", "使用签收更新接口登记差额");
            }
            ObjectNode aggregate = mapper.createObjectNode();
            aggregate.put("id", UUID.randomUUID().toString()).put("receiptNo", documentNo("CR"))
                    .put("tenantId", ctx.tenantId()).put("orderId", orderId).put("orderNo", text(order, "orderNo"))
                    .put("customerName", text(order, "customerName"))
                    .put("signedBy", requiredText(input, "signedBy")).put("signedAt", requiredText(input, "signedAt"))
                    .put("remark", optionalText(input, "remark"))
                    .put("version", 1).put("createdAt", Instant.now().toString())
                    .put("updatedAt", Instant.now().toString());
            aggregate.set("evidence", mapper.valueToTree(input.getOrDefault("evidence", List.of())));
            ArrayNode lines = aggregate.putArray("lines");
            for (Map<String, Object> item : asList(input.get("lines"))) {
                @SuppressWarnings("unchecked") Map<String, Object> line = item;
                String orderLineId = requiredText(line, "orderLineId");
                String outboundLineId = requiredText(line, "outboundLineId");
                String outboundId = requiredText(line, "outboundId");
                SourceLine source = sourceLine(ctx, orderId, outboundId, outboundLineId)
                        .orElseThrow(() -> invalid("签收来源出库行不存在", "检查 outboundId/outboundLineId"));
                if (!orderLineId.equals(source.orderLineId())) {
                    throw invalid("签收行与订单行不一致", "检查 orderLineId");
                }
                ObjectNode persisted = mapper.createObjectNode();
                persisted.put("orderLineId", orderLineId).put("outboundId", outboundId)
                        .put("outboundLineId", outboundLineId).put("productId", source.productId())
                        .put("shippedQty", source.shippedQty().toPlainString())
                        .put("signedQty", nonNegative(line, "signedQty").toPlainString())
                        .put("rejectedQty", nonNegative(line, "rejectedQty").toPlainString())
                        .put("damagedQty", nonNegative(line, "damagedQty").toPlainString())
                        .put("remark", optionalText(line, "remark"));
                BigDecimal total = decimal(persisted, "signedQty").add(decimal(persisted, "rejectedQty"))
                        .add(decimal(persisted, "damagedQty"));
                if (total.compareTo(source.shippedQty()) > 0) {
                    throw invalid("签收、拒收和破损数量不能超过发货数量", "检查行 " + orderLineId);
                }
                lines.add(persisted);
            }
            aggregate.put("receiptStatus", receiptStatus(lines))
                    .put("sourceOutboundVersion", input.getOrDefault("sourceOutboundVersion", "1").toString())
                    .put("sourceFactVersion", input.getOrDefault("sourceFactVersion", "1").toString());
            aggregate.put("status", text(aggregate, "receiptStatus"));
            store.saveReceipt(aggregate);
            publish(ctx, receiptEvent(text(aggregate, "receiptStatus")), "CustomerReceipt",
                    text(aggregate, "id"), 1, orderId, aggregate);
            Map<String, Object> response = toMap(aggregate);
            saveIdempotency(ctx, "RECEIPT_CREATE", idempotencyKey, command, response);
            return response;
        });
    }

    public Map<String, Object> completeCheck(RequestContext ctx, String orderId, Map<String, Object> input) {
        JsonNode order = requireOrder(ctx, orderId);
        if (expectedVersion(ctx, input) != order.path("version").asInt(1)) {
            throw conflict("SALES_409_VERSION_CONFLICT", "订单已被他人修改",
                    "刷新后使用版本 " + order.path("version").asInt(1) + " 检查");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> missing = completionMissings(ctx, order);
        result.put("orderId", orderId);
        result.put("canComplete", missing.isEmpty());
        result.put("missingConditions", missing);
        result.put("checkedAt", Instant.now().toString());
        return result;
    }

    public Map<String, Object> complete(RequestContext ctx, String orderId, Map<String, Object> input) {
        String idempotencyKey = requireKey(ctx, "SALES_ORDER_COMPLETE");
        Map<String, Object> command = new LinkedHashMap<>(input);
        command.put("orderId", orderId);
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replay(ctx, "SALES_ORDER_COMPLETE", idempotencyKey, command);
            if (replay.isPresent()) return replay.get();
            rejectKeyConflict(ctx, "SALES_ORDER_COMPLETE", idempotencyKey, command);
            JsonNode current = requireOrder(ctx, orderId);
            int expected = expectedVersion(ctx, input);
            if (expected != current.path("version").asInt(1)) {
                throw conflict("SALES_409_VERSION_CONFLICT", "订单已被他人修改", "刷新后重试");
            }
            List<String> missing = completionMissings(ctx, current);
            if (!missing.isEmpty()) {
                throw new ApiException(409, "SALES_409_COMPLETION_CONDITION_NOT_MET",
                        "销售完成条件未满足", "缺少: " + String.join("、", missing), List.of(), null);
            }
            ObjectNode updated = current.deepCopy();
            String closureFactId = "closure-" + orderId + "-" + updated.path("version").asInt(1);
            updated.put("overallStatus", "COMPLETED").put("closureFactId", closureFactId)
                    .put("completedAt", Instant.now().toString())
                    .put("version", current.path("version").asInt(1) + 1)
                    .put("updatedAt", Instant.now().toString()).put("completedBy", ctx.actorId());
            store.saveOrder(updated);
            publish(ctx, "sales.order.completed.v1", "SalesOrder", orderId,
                    updated.path("version").asInt(), orderId, updated);
            Map<String, Object> response = toMap(updated);
            saveIdempotency(ctx, "SALES_ORDER_COMPLETE", idempotencyKey, command, response);
            return response;
        });
    }

    private List<String> completionMissings(RequestContext ctx, JsonNode order) {
        List<String> missing = new ArrayList<>();
        String orderId = text(order, "id");
        if (!"SHIPPED".equals(text(order, "overallStatus"))) missing.add("订单全部发货");
        Optional<JsonNode> receipt = store.receipts(ctx.tenantId()).values().stream()
                .filter(item -> orderId.equals(text(item, "orderId"))).findFirst();
        if (receipt.isEmpty() || !"SIGNED".equals(text(receipt.get(), "receiptStatus"))) missing.add("客户签收完成");
        if (financeStore.receivableBySource(ctx.tenantId(), "SalesOrder", orderId)
                .map(item -> !"done".equals(item.status()) || new BigDecimal(item.outstandingAmount()).signum() > 0)
                .orElse(true)) missing.add("AR结算完成");
        boolean openRma = store.rmas(ctx.tenantId()).values().stream()
                .anyMatch(item -> orderId.equals(text(item, "orderId"))
                        && !Set.of("CLOSED", "REJECTED").contains(text(item, "status")));
        if (openRma) missing.add("RMA/争议关闭");
        return missing;
    }

    private Optional<SourceLine> sourceLine(RequestContext ctx, String orderId, String outboundId, String lineId) {
        Optional<SourceLine> outbound = store.outbound(ctx.tenantId(), outboundId)
                .filter(node -> orderId.equals(text(node, "salesOrderId")) || orderId.equals(text(node, "orderId")))
                .map(node -> lineFromContainer(node, lineId));
        if (outbound.isPresent()) return outbound;
        return store.shipmentTask(ctx.tenantId(), outboundId)
                .filter(node -> orderId.equals(text(node, "salesOrderId")))
                .map(node -> lineFromContainer(node, lineId));
    }

    private SourceLine lineFromContainer(JsonNode container, String lineId) {
        for (JsonNode item : container.path("lines")) {
            if (lineId.equals(text(item, "id")) || lineId.equals(text(item, "orderLineId"))
                    || lineId.equals(text(item, "shipmentRequestLineId"))) {
                BigDecimal qty = firstDecimal(item, "postedQty", "shippedQty");
                String orderLineId = firstText(item, "orderLineId", "id");
                String actualLineId = firstText(item, "id", "orderLineId");
                return new SourceLine(text(container, "salesOrderId"), actualLineId, orderLineId,
                        text(item, "productId"), text(item, "productName"),
                        qty, container.path("version").asInt(1));
            }
        }
        throw invalid("出库行不存在", "检查 outboundLineId");
    }

    private record SourceLine(String orderId, String lineId, String orderLineId,
                              String productId, String productName, BigDecimal shippedQty, int version) {}

    private BigDecimal returnedOrReservedQty(RequestContext ctx, String outboundLineId) {
        return store.rmas(ctx.tenantId()).values().stream()
                .filter(item -> outboundLineId.equals(text(item, "outboundLineId")))
                .filter(item -> !"REJECTED".equals(text(item, "status")))
                .map(item -> decimal(item, "requestedQty")).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private JsonNode requireOrder(RequestContext ctx, String orderId) {
        return store.order(ctx.tenantId(), orderId)
                .orElseThrow(() -> invalid("销售订单不存在: " + orderId, "检查 orderId"));
    }

    private void requireFullyShipped(JsonNode order) {
        if (!"SHIPPED".equals(text(order, "overallStatus"))) {
            throw invalid("只有全部发货的订单可以登记客户签收", "当前状态=" + text(order, "overallStatus"));
        }
        for (JsonNode line : order.path("lines")) {
            if (decimal(line, "orderedQty").compareTo(decimal(line, "shippedQty")) != 0) {
                throw invalid("存在未完成发货的订单行", "订单行=" + text(line, "id"));
            }
        }
    }

    private String receiptStatus(ArrayNode lines) {
        boolean anySigned = false;
        boolean allSigned = true;
        boolean disputed = false;
        for (JsonNode line : lines) {
            BigDecimal signed = decimal(line, "signedQty");
            BigDecimal rejected = decimal(line, "rejectedQty");
            BigDecimal damaged = decimal(line, "damagedQty");
            BigDecimal shipped = decimal(line, "shippedQty");
            if (signed.signum() > 0) anySigned = true;
            if (rejected.signum() > 0 || damaged.signum() > 0) disputed = true;
            if (signed.add(rejected).add(damaged).compareTo(shipped) < 0) allSigned = false;
        }
        if (disputed) return "DISPUTED";
        if (!anySigned) return "PENDING";
        return allSigned ? "SIGNED" : "PARTIALLY_SIGNED";
    }

    private String receiptEvent(String status) {
        return switch (status) {
            case "SIGNED" -> "sales.receipt.signed.v1";
            case "REJECTED" -> "sales.receipt.rejected.v1";
            case "DISPUTED" -> "sales.receipt.disputed.v1";
            default -> "sales.receipt.partially_signed.v1";
        };
    }

    public List<Map<String, Object>> slaRules(RequestContext ctx) {
        return store.slaRules(ctx.tenantId()).values().stream().map(this::toMap).toList();
    }

    public Map<String, Object> saveSlaRule(RequestContext ctx, String id, Map<String, Object> input) {
        String command = id == null || id.isBlank() ? "SLA_RULE_CREATE" : "SLA_RULE_UPDATE";
        String key = requireKey(ctx, command);
        Map<String, Object> commandBody = new LinkedHashMap<>(input);
        if (id != null) commandBody.put("id", id);
        return store.transaction(ctx.tenantId(), ignored -> {
            Optional<Map<String, Object>> replay = replay(ctx, command, key, commandBody);
            if (replay.isPresent()) return replay.get();
            rejectKeyConflict(ctx, command, key, commandBody);
            ObjectNode value;
            if (id == null || id.isBlank()) {
                value = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
                        .put("version", 1).put("createdAt", Instant.now().toString());
            } else {
                JsonNode current = store.get(ctx.tenantId(), id, store.slaRules(ctx.tenantId()))
                        .orElseThrow(() -> notFound("SLA规则不存在: " + id));
                if (expectedVersion(ctx, input) != current.path("version").asInt(1)) {
                    throw conflict("SALES_409_VERSION_CONFLICT", "SLA规则已被他人修改", "刷新后重试");
                }
                value = ((ObjectNode) current.deepCopy())
                        .put("version", current.path("version").asInt(1) + 1);
            }
            value.put("tenantId", ctx.tenantId())
                    .put("listenStatus", requiredText(input, "listenStatus"))
                    .put("timeoutThresholdHours", positive(input, "timeoutThresholdHours").intValue())
                    .put("notifyTarget", requiredText(input, "notifyTarget"))
                    .put("channel", requiredText(input, "channel"))
                    .put("escalationThresholdHours", nonNegative(input, "escalationThresholdHours").intValue())
                    .put("enabled", Boolean.parseBoolean(String.valueOf(input.getOrDefault("enabled", "true"))))
                    .put("updatedBy", ctx.actorId()).put("updatedAt", Instant.now().toString());
            store.saveSlaRule(value);
            Map<String, Object> response = toMap(value);
            saveIdempotency(ctx, command, key, commandBody, response);
            return response;
        });
    }

    public int scanSla(RequestContext ctx) {
        String businessTime = Instant.now().toString();
        int created = 0;
        for (JsonNode rule : store.slaRules(ctx.tenantId()).values()) {
            if (!rule.path("enabled").asBoolean(true)) continue;
            String status = text(rule, "listenStatus");
            long threshold = rule.path("timeoutThresholdHours").asLong();
            for (JsonNode order : store.orders(ctx.tenantId())) {
                if (!status.equals(text(order, "overallStatus"))) continue;
                Optional<Instant> changed = factTime(order);
                if (changed.isEmpty() || changed.get().plusMillis(threshold * 3600_000L).isAfter(Instant.now())) continue;
                String id = "sla-" + text(rule, "id") + "-" + text(order, "id") + "-"
                        + order.path("version").asInt(1);
                ObjectNode notification = mapper.createObjectNode();
                notification.put("id", id).put("tenantId", ctx.tenantId()).put("ruleId", text(rule, "id"))
                        .put("orderId", text(order, "id")).put("orderNo", text(order, "orderNo"))
                        .put("orderVersion", order.path("version").asInt(1)).put("channel", text(rule, "channel"))
                        .put("notifyTarget", text(rule, "notifyTarget")).put("status", "PENDING")
                        .put("createdAt", businessTime).put("detectedAt", businessTime);
                if (store.saveSlaNotification(notification)) {
                    created++;
                    publish(ctx, "sales.order.sla.breach.detected.v1", "SalesSlaNotification",
                            id, 1, text(order, "id"), notification);
                }
            }
        }
        return created;
    }

    public List<Map<String, Object>> slaNotifications(RequestContext ctx) {
        return store.slaNotifications(ctx.tenantId()).values().stream().map(this::toMap).toList();
    }

    private void appendHistory(ObjectNode rma, RequestContext ctx, String action, String target, Map<String, Object> input) {
        ObjectNode history = mapper.createObjectNode();
        history.put("transition", action).put("toStatus", target).put("actorId", ctx.actorId())
                .put("comment", optionalText(input, "comment")).put("occurredAt", Instant.now().toString());
        ArrayNode histories = rma.withArray("transitionHistory");
        histories.add(history);
    }

    private void requireTransition(JsonNode value, String actual, String expected, String... allowedCurrent) {
        if (!expected.equals(actual)) {
            throw invalid("toStatus与transition不一致", actionSuggestion(String.valueOf(value.path("transition").asText())));
        }
        if (!Set.of(allowedCurrent).contains(text(value, "status"))) {
            throw new ApiException(409, "RMA_409_INVALID_TRANSITION", "RMA当前状态不允许该动作",
                    "当前状态=" + text(value, "status"), List.of(), null);
        }
    }

    private void requireTransitionPermission(RequestContext ctx, String action) {
        String permission = switch (action) {
            case "APPROVE" -> "sales.rma.approve";
            case "TRANSIT_UPDATE" -> "sales.rma.transit.update";
            case "RECEIVE", "RESTOCK" -> "inventory.rma.receive";
            case "INSPECT", "START_INSPECTION" -> "quality.rma.inspect";
            case "CREDIT_NOTE" -> "finance.rma.credit-note.create";
            case "CLOSE" -> "sales.rma.close";
            default -> "sales.rma.create";
        };
        if (action.equals("RESTOCK")) require(ctx, "inventory.rma.restock");
        require(ctx, permission);
    }

    private void require(RequestContext ctx, String permission) {
        if (!ctx.has(permission)) {
            throw forbidden("无权执行该操作，所需权限: " + permission);
        }
    }

    private String actionSuggestion(String action) {
        return switch (action) {
            case "APPROVE" -> "REQUESTED -> APPROVED 或 REJECTED";
            case "TRANSIT_UPDATE" -> "APPROVED -> IN_TRANSIT";
            case "RECEIVE" -> "IN_TRANSIT -> RECEIVED";
            case "START_INSPECTION" -> "RECEIVED -> INSPECTING";
            case "INSPECT" -> "INSPECTING -> INSPECTION_COMPLETED";
            case "RESTOCK" -> "INSPECTION_COMPLETED -> RESTOCKED";
            default -> "检查 transition/toStatus";
        };
    }

    private void publish(RequestContext ctx, String eventType, String aggregateType, String aggregateId,
                         int version, String correlationId, JsonNode payload) {
        String eventId = UUID.randomUUID().toString();
        ObjectNode event = mapper.createObjectNode();
        event.put("eventId", eventId).put("eventType", eventType).put("tenantId", ctx.tenantId())
                .put("aggregateType", aggregateType).put("aggregateId", aggregateId).put("aggregateVersion", version)
                .put("correlationId", correlationId).put("traceId", ctx.traceId())
                .put("occurredAt", Instant.now().toString()).put("status", "PENDING").put("attempts", 0);
        event.set("payload", payload.deepCopy());
        store.publishEvent(ctx.tenantId(), eventId, event);
    }

    private Optional<Map<String, Object>> replay(
            RequestContext ctx, String command, String key, Map<String, Object> body) {
        return store.idempotency(ctx.tenantId(), command, key)
                .filter(item -> requestHash(command, body).equals(text(item, "requestHash")))
                .map(item -> toMap(item.path("body")));
    }

    private void rejectKeyConflict(
            RequestContext ctx, String command, String key, Map<String, Object> body) {
        store.idempotency(ctx.tenantId(), command, key).ifPresent(item -> {
            if (!requestHash(command, body).equals(text(item, "requestHash"))) {
                throw conflict("SALES_409_IDEMPOTENCY_CONFLICT", "幂等键已被不同请求使用", "更换幂等键后重试");
            }
        });
    }

    private void saveIdempotency(
            RequestContext ctx, String command, String key,
            Map<String, Object> request, Map<String, Object> response) {
        store.saveIdempotency(ctx.tenantId(), command, key, requestHash(command, request), 200,
                mapper.valueToTree(response));
    }

    private String requireKey(RequestContext ctx, String command) {
        if (ctx.idempotencyKey() == null || ctx.idempotencyKey().isBlank()) {
            throw new ApiException(400, "SALES_400_IDEMPOTENCY_KEY_REQUIRED",
                    command + "缺少 X-Idempotency-Key", "请求头携带唯一 X-Idempotency-Key", List.of(), null);
        }
        return ctx.idempotencyKey();
    }

    private int expectedVersion(RequestContext ctx, Map<String, Object> input) {
        if (ctx.expectedVersion() != null) return ctx.expectedVersion();
        Object version = input.get("version");
        if (version == null) return -1;
        try {
            return Integer.parseInt(String.valueOf(version));
        } catch (NumberFormatException exception) {
            throw invalid("version必须是整数", "检查 If-Match 或 body.version");
        }
    }

    private String requestHash(String command, Map<String, Object> body) {
        try {
            String payload = command + ":" + mapper.writeValueAsString(body == null ? Map.of() : body);
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash command", exception);
        }
    }

    private ApiException invalid(String message, String suggestion) {
        return new ApiException(422, "SALES_422_BUSINESS_RULE_VIOLATION", message, suggestion, List.of(), null);
    }

    private ApiException forbidden(String message) {
        return new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", message, "联系租户管理员授权", List.of(), null);
    }

    private ApiException notFound(String message) {
        return new ApiException(404, "SALES_404_NOT_FOUND", message, "检查单据ID", List.of(), null);
    }

    private ApiException conflict(String code, String message, String suggestion) {
        return new ApiException(409, code, message, suggestion, List.of(), null);
    }

    private String requiredText(Map<String, Object> input, String field) {
        Object value = input.get(field);
        if (value == null || String.valueOf(value).isBlank()) {
            throw new ApiException(422, "SALES_422_FIELD_REQUIRED", field + "不能为空",
                    "补充必填字段 " + field, List.of(new ApiException.FieldError(field, "required")), null);
        }
        return String.valueOf(value);
    }

    private String optionalText(Map<String, Object> input, String field) {
        Object value = input.get(field);
        return value == null ? "" : String.valueOf(value);
    }

    private BigDecimal positive(Map<String, Object> input, String field) {
        BigDecimal value = nonNegative(input, field);
        if (value.signum() <= 0) throw invalid(field + "必须大于0", "检查 " + field);
        return value;
    }

    private BigDecimal nonNegative(Map<String, Object> input, String field) {
        Object value = input.get(field);
        if (value == null || String.valueOf(value).isBlank()) {
            throw new ApiException(422, "SALES_422_FIELD_REQUIRED", field + "不能为空",
                    "补充必填字段 " + field, List.of(new ApiException.FieldError(field, "required")), null);
        }
        try {
            BigDecimal result = new BigDecimal(String.valueOf(value));
            if (result.signum() < 0) throw new NumberFormatException();
            return result;
        } catch (NumberFormatException exception) {
            throw invalid(field + "必须是大于等于0的数字", "检查 " + field);
        }
    }

    private BigDecimal nonNegativeJson(JsonNode input, String field) {
        try {
            BigDecimal result = new BigDecimal(text(input, field));
            if (result.signum() < 0) throw new NumberFormatException();
            return result;
        } catch (NumberFormatException exception) {
            throw invalid(field + "必须是大于等于0的数字", "检查 " + field);
        }
    }

    private BigDecimal decimal(JsonNode value, String field) {
        String raw = text(value, field);
        try {
            return raw.isBlank() ? BigDecimal.ZERO : new BigDecimal(raw);
        } catch (NumberFormatException exception) {
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal firstDecimal(JsonNode value, String... fields) {
        for (String field : fields) {
            String raw = text(value, field);
            if (!raw.isBlank()) {
                try {
                    return new BigDecimal(raw);
                } catch (NumberFormatException ignored) {
                    // Try the next field.
                }
            }
        }
        return BigDecimal.ZERO;
    }

    private String firstText(JsonNode value, String first, String second) {
        String result = text(value, first);
        return result.isBlank() ? text(value, second) : result;
    }

    private Optional<Instant> factTime(JsonNode value) {
        String raw = !text(value, "updatedAt").isBlank() ? text(value, "updatedAt") : text(value, "createdAt");
        try {
            return raw.isBlank() ? Optional.empty() : Optional.of(Instant.parse(raw));
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private String text(JsonNode value, String field) {
        return value != null && value.hasNonNull(field) ? value.get(field).asText() : "";
    }

    private String documentNo(String prefix) {
        return prefix + "-" + Long.toString(System.currentTimeMillis(), 36).toUpperCase()
                + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    }

    private Map<String, Object> toMap(JsonNode value) {
        return mapper.convertValue(value, new TypeReference<Map<String, Object>>() { });
    }

    private List<Map<String, Object>> asList(Object value) {
        if (value == null) return List.of();
        return mapper.convertValue(value, new TypeReference<List<Map<String, Object>>>() { });
    }

    public record SalesMonitor(
            String availability, String currency, String dataAsOf, String sourceVersion,
            int monthlyOrderCount, String totalSalesAmount,
            int stalledCount, int deliveryRiskCount,
            List<Map<String, Object>> stalledOrders, List<Map<String, Object>> deliveryRiskOrders
    ) {}
}
