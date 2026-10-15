package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;

public class ProductionService {
    public record Command(int statusCode, JsonNode body, String aggregateType, String aggregateId, boolean replayed) {}

    private final ProductionStore store;
    private final ObjectMapper mapper;
    private ProductionInventoryPort inventoryPort;

    public void setInventoryPort(ProductionInventoryPort port) { this.inventoryPort = port; }

    public ProductionService(ProductionStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    public Map<String, Object> readiness(RequestContext context) {
        return Map.of(
                "status", "READY", "module", "production", "apiVersion", "v1",
                "tenantId", context.tenantId(),
                "permissions", context.permissions(),
                "checks", Map.of("repository", "UP", "eventOutbox", "UP", "platformCapability", "ASSUMED_BY_GATEWAY"),
                "timestamp", now()
        );
    }

    public Map<String, Object> listDemands(RequestContext context, String status, String factoryResourceId,
                                           String search, int page, int pageSize) {
        require(context, "production.demand.read");
        return store.transaction(context.tenantId(), repository -> {
        List<JsonNode> all = store.demands(context.tenantId(), status, factoryResourceId, search, Integer.MAX_VALUE, 0).stream()
                .filter(item -> context.canAccessFactory(text(item, "factoryResourceId")))
                .filter(item -> text(item, "inventoryWarehouseId").isBlank()
                        || context.canAccessWarehouse(text(item, "inventoryWarehouseId")))
                .toList();
        return pageResult(all.stream().map(this::demandWithSource).skip((long) (page - 1) * pageSize).limit(pageSize).toList(), all.size());
        });
    }

    public Map<String, Object> listWorkOrders(RequestContext context, String status, String factoryResourceId,
                                              String search, int page, int pageSize) {
        require(context, "production.work-order.read");
        return store.transaction(context.tenantId(), repository -> {
        List<JsonNode> all = store.workOrders(context.tenantId(), status, factoryResourceId, search, Integer.MAX_VALUE, 0).stream()
                .filter(item -> context.canAccessFactory(text(item, "factoryResourceId")))
                .filter(item -> context.canAccessWarehouse(text(item.path("parameterSnapshot"), "inventoryWarehouseId")))
                .toList();
        return pageResult(all.stream().skip((long) (page - 1) * pageSize).limit(pageSize).toList(), all.size());
        });
    }

    public JsonNode workOrder(RequestContext context, String id) {
        require(context, "production.work-order.read");
        return loadWorkOrder(context, id);
    }

    private JsonNode loadWorkOrder(RequestContext context, String id) {
        return store.transaction(context.tenantId(), repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), id), "工单");
            requireOrderScope(context, order);
            return order;
        });
    }

    private JsonNode scopedDemand(RequestContext context, String id) {
        JsonNode demand = require(store.demand(context.tenantId(), id), "需求");
        requireFactoryAccess(context, text(demand, "factoryResourceId"));
        if (!text(demand, "inventoryWarehouseId").isBlank())
            requireWarehouseAccess(context, text(demand, "inventoryWarehouseId"));
        return demand;
    }

    private JsonNode scopedWorkOrder(RequestContext context, String id) {
        JsonNode order = require(store.workOrder(context.tenantId(), id), "工单");
        requireOrderScope(context, order);
        return order;
    }

    private void requireOrderScope(RequestContext context, JsonNode order) {
        requireFactoryAccess(context, text(order, "factoryResourceId"));
        requireWarehouseAccess(context, text(order.path("parameterSnapshot"), "inventoryWarehouseId"));
    }

    private void requireFactoryAccess(RequestContext context, String identifier) {
        if (!context.canAccessFactory(identifier)) forbidden("无权访问该工厂数据", "联系管理员确认工厂范围");
    }

    private void requireWarehouseAccess(RequestContext context, String identifier) {
        if (!context.canAccessWarehouse(identifier)) forbidden("无权访问该仓库数据", "联系管理员确认仓库范围");
    }

    private JsonNode scopedOrderForFilter(String tenantId, String workOrderId) {
        return store.workOrder(tenantId, workOrderId).orElseGet(mapper::createObjectNode);
    }

    public JsonNode task(RequestContext context, String id) {
        require(context, "production.task.read");
        return store.transaction(context.tenantId(), repository -> require(store.task(context.tenantId(), id), "任务"));
    }

    public JsonNode salesOrderIntake(RequestContext context, String salesOrderId, String sourceLineId, int sourceRevision) {
        require(context, "production.demand.read");
        JsonNode value = store.salesOrderIntakes.get(ProductionStore.key(
                context.tenantId(), salesOrderId, sourceLineId, String.valueOf(sourceRevision)
        ));
        return require(Optional.ofNullable(value).map(node -> node.deepCopy()), "销售订单接入记录");
    }

    public Object receiveInventoryAvailability(RequestContext context, JsonNode input) {
        require(context, "production.inventory.sync");
        requireWarehouseAccess(context, text(input, "inventoryWarehouseId"));
        return store.transaction(context.tenantId(), (ProductionStore repository) -> {
            String eventKey = ProductionStore.key(context.tenantId(), "production.inventory-availability-projection", text(input, "eventId"));
            boolean duplicate = store.inboxEvents.containsKey(eventKey);
            String projection = "DUPLICATE";
            if (!duplicate) {
                String key = ProductionStore.key(context.tenantId(), text(input, "productId"), text(input, "inventoryWarehouseId"));
                JsonNode current = store.inventoryAvailability.get(key);
                if (current != null && current.path("factVersion").asInt() >= input.path("factVersion").asInt()) {
                    projection = "STALE";
                } else {
                    ObjectNode value = mapper.createObjectNode()
                            .put("tenantId", context.tenantId()).put("productId", text(input, "productId"))
                            .put("inventoryWarehouseId", text(input, "inventoryWarehouseId"))
                            .put("availableQty", text(input, "availableQty")).put("uom", text(input, "uom"))
                            .put("factVersion", input.path("factVersion").asInt())
                            .put("sourceEventId", text(input, "eventId")).put("sourceSystem", text(input, "sourceSystem"))
                            .put("asOf", text(input, "asOf")).put("updatedAt", now());
                    store.inventoryAvailability.put(key, value);
                    projection = current == null ? "CREATED" : "UPDATED";
                }
                ObjectNode inbox = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                        .put("consumerName", "production.inventory-availability-projection")
                        .put("eventId", text(input, "eventId")).put("eventType", "inventory.availability.changed")
                        .put("eventVersion", input.path("eventVersion").asInt(1))
                        .put("aggregateId", text(input, "inventoryWarehouseId") + ":" + text(input, "productId"))
                        .put("aggregateVersion", input.path("factVersion").asInt()).put("status", "PROCESSED")
                        .put("retryCount", 0).put("receivedAt", now()).put("processedAt", now());
                inbox.set("payload", input);
                store.inboxEvents.put(eventKey, inbox);
            }
            return availabilityResult(context, input, duplicate, projection);
        });
    }

    public Command createDemand(RequestContext context, JsonNode input) {
        require(context, "production.demand.create");
        requireFactoryAccess(context, text(input, "factoryResourceId"));
        if (!text(input, "inventoryWarehouseId").isBlank())
            requireWarehouseAccess(context, text(input, "inventoryWarehouseId"));
        positive(input, "qty");
        if (text(input, "productId").isBlank() || text(input, "uom").isBlank() || text(input, "factoryResourceId").isBlank()) invalid("需求缺少产品、单位或工厂");
        try { LocalDate.parse(text(input, "dueDate")); } catch (RuntimeException exception) { invalid("需求日期无效"); }
        return command(context, "CreateDemand", input, repository -> {
            ObjectNode demand = mapper.createObjectNode()
                    .put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", text(input, "code", "DM-" + codeSuffix()))
                    .put("sourceType", text(input, "sourceType")).put("productId", text(input, "productId"));
            copyIfPresent(demand, input, "productName", "inventoryWarehouseId", "sourceDescription");
            demand.put("qty", text(input, "qty")).put("uom", text(input, "uom"))
                    .put("dueDate", text(input, "dueDate"))
                    .put("priority", input.path("priority").asInt(50))
                    .put("factoryResourceId", text(input, "factoryResourceId")).put("status", "RECEIVED")
                    .put("revision", input.path("sourceRevision").asInt(1))
                    .put("correlationId", text(input, "correlationId", uuid()))
                    .put("createdBy", context.actorId()).put("version", 1)
                    .put("createdAt", now()).put("updatedAt", now());
            demand.set("blockReasons", arrayNode());
            store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")), demand);
            if (input.hasNonNull("sourceId")) {
                JsonNode snapshot = input.hasNonNull("payloadSnapshot") ? input.get("payloadSnapshot") : mapper.createObjectNode();
                ObjectNode source = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                        .put("demandId", text(demand, "id"))
                        .put("sourceSystem", text(input, "sourceSystem", "MANUAL")).put("sourceType", text(input, "sourceType"))
                        .put("sourceId", text(input, "sourceId")).put("sourceLineId", text(input, "sourceLineId"))
                        .put("sourceRevision", input.path("sourceRevision").asInt(1)).put("qty", text(input, "qty"))
                        .set("payloadSnapshot", snapshot);
                copyIfPresent(source, snapshot, "shipmentRequestId", "shipmentRequestLineId");
                if (snapshot.hasNonNull("salesOrderLineId")) source.set("salesOrderLineId", snapshot.get("salesOrderLineId").deepCopy());
                else if (input.hasNonNull("sourceLineId")) source.set("salesOrderLineId", input.get("sourceLineId").deepCopy());
                store.demandSources.put(ProductionStore.key(context.tenantId(), text(source, "id")), source);
            }
            transition(repository, context, "Demand", text(demand, "id"), null, "RECEIVED", 1,
                    Map.of("code", text(demand, "code"), "qty", text(input, "qty"), "productId", text(input, "productId")),
                    null, null, text(demand, "correlationId"));
            return created(demand, "Demand", text(demand, "id"));
        });
    }

    public Command createSalesOrderIntake(RequestContext context, JsonNode input) {
        require(context, "production.demand.create");
        requireFactoryAccess(context, text(input, "factoryResourceId"));
        requireWarehouseAccess(context, text(input, "inventoryWarehouseId"));
        return command(context, "CreateSalesOrderIntake", input, repository -> {
            String lineId = text(input, "sourceLineId", "1");
            int revision = input.path("sourceRevision").asInt(1);
            JsonNode availability = require(store.inventoryAvailability(
                    context.tenantId(), text(input, "productId"), text(input, "inventoryWarehouseId")
            ), "库存可用量事实", 424, "PRODUCTION_424_DEPENDENCY_FAILED");
            String shortage = compare(text(input, "orderedQty"), text(availability, "availableQty")) > 0
                    ? subtract(text(input, "orderedQty"), text(availability, "availableQty")) : "0";
            ObjectNode intake = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("salesOrderId", text(input, "salesOrderId")).put("sourceLineId", lineId)
                    .put("sourceRevision", revision).put("productId", text(input, "productId"));
            copyIfPresent(intake, input, "productName");
            intake.put("orderedQty", text(input, "orderedQty")).put("availableQty", text(availability, "availableQty"))
                    .put("shortageQty", shortage).put("uom", text(input, "uom")).put("dueDate", text(input, "dueDate"))
                    .put("factoryResourceId", text(input, "factoryResourceId"))
                    .put("inventoryWarehouseId", text(input, "inventoryWarehouseId"))
                    .put("inventoryFactVersion", availability.path("factVersion").asInt())
                    .put("decision", compare(shortage, "0") > 0 ? "CREATE_PRODUCTION_DEMAND" : "FULFILL_FROM_STOCK")
                    .put("status", "COMPLETED").put("correlationId", text(input, "correlationId", uuid()))
                    .put("traceId", context.traceId()).put("createdBy", context.actorId()).put("version", 1).put("createdAt", now());
            if (compare(shortage, "0") > 0) {
                ObjectNode demand = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                        .put("code", "DM-" + codeSuffix()).put("sourceType", "SALES_ORDER_SHORTAGE")
                        .put("productId", text(input, "productId"));
                copyIfPresent(demand, input, "productName");
                demand.put("qty", shortage).put("uom", text(input, "uom")).put("dueDate", text(input, "dueDate"))
                        .put("priority", input.path("priority").asInt(80))
                        .put("factoryResourceId", text(input, "factoryResourceId")).put("status", "RECEIVED")
                        .put("revision", revision).put("correlationId", text(intake, "correlationId"))
                        .put("createdBy", context.actorId()).put("version", 1)
                        .put("createdAt", now()).put("updatedAt", now());
                demand.set("blockReasons", arrayNode());
                store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")), demand);
                intake.put("demandId", text(demand, "id"));
                transition(repository, context, "Demand", text(demand, "id"), null, "RECEIVED", 1,
                        Map.of("code", text(demand, "code"), "qty", shortage, "productId", text(input, "productId")),
                        null, null, text(intake, "correlationId"));
            }
            store.salesOrderIntakes.put(ProductionStore.key(context.tenantId(), text(input, "salesOrderId"), lineId,
                    String.valueOf(revision)), intake);
            if (intake.hasNonNull("demandId")) {
                ObjectNode source = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                        .put("demandId", text(intake, "demandId")).put("sourceSystem", "SALES")
                        .put("sourceType", "SALES_ORDER").put("sourceId", text(input, "salesOrderId"))
                        .put("sourceLineId", lineId).put("sourceRevision", revision).put("qty", shortage)
                        .set("payloadSnapshot", mapper.createObjectNode()
                                .put("orderedQty", text(input, "orderedQty"))
                                .put("availableQty", text(availability, "availableQty"))
                                .put("inventoryFactVersion", availability.path("factVersion").asInt())
                                .put("inventoryWarehouseId", text(input, "inventoryWarehouseId")));
                store.demandSources.put(ProductionStore.key(context.tenantId(), text(source, "id")), source);
            }
            transition(repository, context, "SalesOrderIntake", text(intake, "id"), null, "COMPLETED", 1,
                    Map.of("salesOrderId", text(input, "salesOrderId"), "shortageQty", shortage,
                            "decision", text(intake, "decision")), null, null, text(intake, "correlationId"));
            audit(repository, context, "SALES_ORDER_INTAKE", "SalesOrderIntake", text(intake, "id"), null, intake, null);
            ObjectNode body = mapper.createObjectNode().put("recovered", false);
            body.set("intake", intake);
            body.set("availability", availability);
            if (intake.hasNonNull("demandId")) body.set("demand", Optional.ofNullable(scopedDemand(context, text(intake, "demandId"))).orElse(null));
            return created(body, "SalesOrderIntake", text(intake, "id"));
        });
    }

    public Command validateDemand(RequestContext context, String id, JsonNode input) {
        require(context, "production.demand.review");
        ObjectNode payload = payloadWithId(id, input);
        return command(context, "ValidateDemand", payload, repository -> {
            JsonNode demand = scopedDemand(context, id);
            if (demand.path("archived").asBoolean()) invalid("已归档需求不能执行校验");
            requireStatus(demand, "需求", "RECEIVED", "BLOCKED");
            requireVersion(context, version(demand));
            ArrayNode missing = arrayNode();
            JsonNode bom = store.bom(context.tenantId(), text(demand, "productId")).orElse(null);
            if (bom == null) missing.add("缺少服务端生效 BOM");
            else if (text(bom, "routingSnapshotId").isBlank()
                    || !text(bom, "routingSnapshotId").equals(text(bom.path("routingSnapshot"), "id"))
                    || !bom.path("routingSnapshot").path("operations").isArray()
                    || bom.path("routingSnapshot").path("operations").isEmpty()) missing.add("缺少服务端生效工艺快照");
            if (input.path("productActive").isBoolean() && !input.path("productActive").asBoolean()) missing.add("产品未启用");
            if (input.path("factoryActive").isBoolean() && !input.path("factoryActive").asBoolean()) missing.add("工厂不可用");
            if (input.path("bomEffective").isBoolean() && !input.path("bomEffective").asBoolean()) missing.add("缺少有效 BOM");
            if (input.path("routingEffective").isBoolean() && !input.path("routingEffective").asBoolean()) missing.add("缺少有效工艺路线");
            ObjectNode result = nextVersion(demand).put("status", missing.isEmpty() ? "PENDING_REVIEW" : "BLOCKED")
                    .put("reviewerId", context.actorId());
            result.set("blockReasons", missing);
            if (missing.isEmpty()) result.put("handlerRole", "PRODUCTION_DIRECTOR").put("assignedAt", now());
            store.demands.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "Demand", id, text(demand, "status"), "VALIDATING", version(demand) + 1, Map.of());
            transition(repository, context, "Demand", id, "VALIDATING", text(result, "status"), version(result),
                    Map.of("blockReasons", missing), missing.isEmpty() ? null : "MASTER_DATA_MISSING", missing.toString());
            return updated(result, "Demand", id);
        });
    }

    public Command approveDemand(RequestContext context, String id, JsonNode input) {
        require(context, "production.demand.approve");
        return command(context, "ApproveDemand", payloadWithId(id, input), repository -> {
            JsonNode demand = scopedDemand(context, id);
            requireStatus(demand, "需求", "PENDING_REVIEW");
            requireVersion(context, version(demand));
            ObjectNode result = nextVersion(demand).put("status", "APPROVED").put("approvedBy", context.actorId())
                    .put("approvedAt", now()).put("handlerRole", "PRODUCTION_PLANNER").put("assignedAt", now());
            result.remove("handlerId");
            result.remove("acceptedAt");
            store.demands.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "Demand", id, text(demand, "status"), "APPROVED", version(result),
                    Map.of("approvedBy", context.actorId()), null, text(input, "reason"), text(demand, "correlationId"));
            outbox(repository, "production.demand.approved.v1", "Demand", id, version(result), text(demand, "correlationId"),
                    context, Map.of("demandId", id, "demandCode", text(demand, "code"), "approvedBy", context.actorId()));
            audit(repository, context, "DEMAND_APPROVE", "Demand", id, demand, result, text(input, "remark"));
            return updated(result, "Demand", id);
        });
    }

    public Command claimDemand(RequestContext context, String id) {
        require(context, "production.demand.claim");
        return command(context, "ClaimDemand", payloadWithId(id, mapper.createObjectNode()), repository -> {
            JsonNode demand = scopedDemand(context, id);
            requireStatus(demand, "需求", "APPROVED");
            requireVersion(context, version(demand));
            ObjectNode result = nextVersion(demand).put("handlerId", context.actorId()).put("acceptedAt", now());
            store.demands.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "Demand", id, text(demand, "status"), text(result, "status"), version(result),
                    Map.of("handlerId", context.actorId()), "MPS_DEMAND_CLAIMED", null);
            audit(repository, context, "DEMAND_CLAIM", "Demand", id, demand, result, null);
            return updated(result, "Demand", id);
        });
    }

    public Command createWorkOrder(RequestContext context, JsonNode input) {
        require(context, "production.work-order.create");
        return command(context, "CreateWorkOrder", input, repository -> {
            ArrayNode links = input.withArray("demandLinks");
            if (links.isEmpty()) invalid("工单必须关联正式生产需求");
            positive(input, "plannedQty");
            String warehouseId = text(input, "inventoryWarehouseId");
            JsonNode bom = require(store.bom(context.tenantId(), text(input, "productId")), "生效 BOM");
            String allocated = "0";
            for (JsonNode link : links) {
                JsonNode demand = scopedDemand(context, text(link, "demandId"));
                requireStatus(demand, "关联需求", "PLANNED");
                if (!text(demand, "workOrderId").isBlank()) {
                    throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "需求已生成工单", "继续处理原工单");
                }
                if (!text(demand, "productId").equals(text(input, "productId"))
                        || !text(demand, "uom").equals(text(input, "uom"))
                        || !text(demand, "factoryResourceId").equals(text(input, "factoryResourceId"))
                        || compare(text(link, "allocatedQty"), text(demand, "qty")) != 0) invalid("工单来源或分配数量与需求不一致");
                if (!text(demand, "scheduleCandidateId").equals(text(input, "scheduleCandidateId"))
                        || text(input, "scheduleCandidateId").isBlank()) invalid("工单必须引用当前需求的有效 APS 候选");
                String sourceWarehouse = text(demand, "inventoryWarehouseId");
                JsonNode source = store.demandSource(context.tenantId(), text(demand, "id")).orElse(null);
                if (sourceWarehouse.isBlank() && source != null) sourceWarehouse = text(source.path("payloadSnapshot"), "warehouseId");
                if (warehouseId.isBlank()) warehouseId = sourceWarehouse;
                if (!sourceWarehouse.isBlank() && !warehouseId.equals(sourceWarehouse)) invalid("工单入库仓库与来源需求不一致");
                allocated = add(allocated, text(link, "allocatedQty"));
            }
            if (warehouseId.isBlank()) invalid("工单必须指定成品入库仓库");
            if (compare(allocated, text(input, "plannedQty")) != 0) invalid("需求分配合计必须等于工单数量");
            ObjectNode order = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", text(input, "code", "WO-" + codeSuffix())).put("productId", text(input, "productId"));
            copyIfPresent(order, input, "productName", "workshopResourceId", "lineResourceId", "bomSnapshotId",
                    "routingSnapshotId", "scheduleCandidateId", "assigneeEmployeeId", "correlationId");
            order.put("bomSnapshotId", text(bom, "id")).put("routingSnapshotId", text(bom, "routingSnapshotId"))
                    .put("kittingStatus", "UNCHECKED");
            order.set("bomSnapshot", bom.deepCopy());
            order.set("routingSnapshot", bom.path("routingSnapshot").deepCopy());
            order.put("factoryResourceId", text(input, "factoryResourceId"))
                    .put("workCenterResourceId", text(input, "workCenterResourceId"))
                    .put("plannedQty", text(input, "plannedQty")).put("inputQty", text(input, "inputQty", "0"))
                    .put("reportedGoodQty", "0").put("reportedDefectQty", "0").put("reportedScrapQty", "0")
                    .put("postedQty", "0").put("uom", text(input, "uom")).put("dueDate", text(input, "dueDate"))
                    .put("status", "PLANNED")
                    .put("correlationId", text(input, "correlationId", uuid()))
                    .put("createdBy", context.actorId()).put("version", 1).put("createdAt", now()).put("updatedAt", now());
            ObjectNode parameterSnapshot = mapper.createObjectNode()
                    .put("inventoryWarehouseId", warehouseId);
            parameterSnapshot.set("demandIds", links.deepCopy());
            order.set("parameterSnapshot", parameterSnapshot);
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), order);
            for (int index = 0; index < links.size(); index++) {
                JsonNode link = links.get(index);
                    JsonNode demand = scopedDemand(context, text(link, "demandId"));
                requireStatus(demand, "关联需求", "PLANNED");
                store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")),
                        nextVersion(demand).put("workOrderId", text(order, "id")).put("workOrderCode", text(order, "code")));
                ObjectNode linkValue = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                        .put("workOrderId", text(order, "id")).put("demandId", text(link, "demandId"))
                        .put("allocatedQty", text(link, "allocatedQty")).put("priorityRank", index + 1)
                        .put("customerLocked", link.path("customerLocked").asBoolean(false));
                copyIfPresent(linkValue, link, "promisedDate");
                store.workOrderDemands.put(ProductionStore.key(context.tenantId(), text(linkValue, "id")), linkValue);
            }
            transition(repository, context, "WorkOrder", text(order, "id"), null, text(order, "status"), 1,
                    Map.of("code", text(order, "code"), "plannedQty", text(input, "plannedQty")), null, null,
                    text(order, "correlationId"));
            return created(order, "WorkOrder", text(order, "id"));
        });
    }

    public Map<String, Object> releaseImpact(RequestContext context, String id) {
        JsonNode order = workOrder(context, id);
        List<Map<String, String>> blockers = releaseBlockers(order);
        return Map.of("canRelease", blockers.isEmpty(), "blockers", blockers, "version", version(order));
    }

    public Command checkKitting(RequestContext context, String id, JsonNode input) {
        require(context, "production.work-order.release");
        Optional<Command> replay = replay(context, "CheckKitting", payloadWithId(id, input));
        if (replay.isPresent()) return replay.get();
        JsonNode order = loadWorkOrder(context, id);
        requireStatus(order, "工单", "PLANNED", "SCHEDULED", "KITTING");
        requireVersion(context, version(order));
        JsonNode bom = order.path("bomSnapshot");
        if (bom.isMissingNode()) bom = require(store.bom(context.tenantId(), text(order, "productId")), "生效 BOM");
        if (inventoryPort == null) unavailableInventory();
        JsonNode snapshot = inventoryPort.reserve(context, id, materialRequirements(bom, text(order, "plannedQty")));
        return command(context, "CheckKitting", payloadWithId(id, input), repository -> {
            JsonNode current = scopedWorkOrder(context, id);
            requireStatus(current, "工单", "PLANNED", "SCHEDULED", "KITTING");
            ObjectNode result = nextVersion(current).put("kittingStatus", "READY").put("kittingCheckedAt", now());
            result.set("materialReservation", snapshot);
            store.workOrders.put(ProductionStore.key(context.tenantId(), id), result);
            audit(repository, context, "KITTING_CHECK", "WorkOrder", id, current, result, null);
            return updated(result, "WorkOrder", id);
        });
    }

    public Command releaseWorkOrder(RequestContext context, String id, JsonNode input) {
        require(context, "production.work-order.release");
        return command(context, "ReleaseWorkOrder", payloadWithId(id, input), repository -> {
            JsonNode order = scopedWorkOrder(context, id);
            requireStatus(order, "工单", "PLANNED", "SCHEDULED", "KITTING");
            requireVersion(context, version(order));
            List<Map<String, String>> blockers = releaseBlockers(order);
            if (!blockers.isEmpty()) throw new ApiException(409, "PRODUCTION_409_KITTING_NOT_READY",
                    "下达条件未满足", "完成齐套与排程后重试", Map.of("blockers", blockers));
            ObjectNode result = nextVersion(order).put("status", "RELEASED");
            store.workOrders.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "WorkOrder", id, text(order, "status"), "RELEASED", version(result), Map.of(),
                    null, text(input, "reason"), text(order, "correlationId"));
            audit(repository, context, "WORK_ORDER_RELEASE", "WorkOrder", id, order, result, text(input, "reason"));
            return updated(result, "WorkOrder", id);
        });
    }

    public Command startWorkOrder(RequestContext context, String id, JsonNode input) {
        require(context, "production.work-order.start");
        Optional<Command> replay = replay(context, "StartWorkOrder", payloadWithId(id, input));
        if (replay.isPresent()) return replay.get();
        JsonNode order = loadWorkOrder(context, id);
        if ("IN_PROGRESS".equals(text(order, "status"))) {
            return command(context, "StartWorkOrder", payloadWithId(id, input), repository -> updated(order, "WorkOrder", id));
        }
        requireStatus(order, "工单", "RELEASED");
        requireVersion(context, version(order));
        if (inventoryPort == null) unavailableInventory();
        inventoryPort.consume(context, id);
        return changeWorkOrder(context, id, "StartWorkOrder", "production.work-order.start", "IN_PROGRESS", input);
    }

    public Command pauseWorkOrder(RequestContext context, String id, JsonNode input) {
        if (text(input, "reason").isBlank()) invalid("暂停工单必须填写原因");
        return changeWorkOrder(context, id, "PauseWorkOrder", "production.work-order.pause", "PAUSED", input);
    }

    public Command resumeWorkOrder(RequestContext context, String id, JsonNode input) {
        return changeWorkOrder(context, id, "ResumeWorkOrder", "production.work-order.pause", "IN_PROGRESS", input);
    }

    public Command submitReport(RequestContext context, String workOrderId, JsonNode input) {
        require(context, "production.work-order.report");
        nonnegative(input, "goodQty"); nonnegative(input, "defectQty"); nonnegative(input, "scrapQty"); nonnegative(input, "inputQty");
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "SubmitWorkReport", payload, repository -> {
            JsonNode order = scopedWorkOrder(context, workOrderId);
            requireStatus(order, "工单", "IN_PROGRESS");
            requireVersion(context, version(order));
            String reportTotal = add(text(input, "goodQty"), text(input, "defectQty", "0"), text(input, "scrapQty", "0"));
            if (compare(reportTotal, "0") <= 0) invalid("本次报工数量必须大于 0");
            String nextInput = add(text(order, "inputQty"), text(input, "inputQty", "0"));
            String nextTotal = add(text(order, "reportedGoodQty"), text(order, "reportedDefectQty"),
                    text(order, "reportedScrapQty"), reportTotal);
            if (compare(nextTotal, min(nextInput, text(order, "plannedQty"))) > 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "累计报工数量超过投入量或可报上限", "减少本次数量或先补充有效投入");
            }
            ObjectNode report = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("workOrderId", workOrderId).put("goodQty", text(input, "goodQty"))
                    .put("defectQty", text(input, "defectQty", "0")).put("scrapQty", text(input, "scrapQty", "0"))
                    .put("inputQty", text(input, "inputQty", "0")).put("uom", text(input, "uom")).put("status", "POSTED")
                    .put("reportedBy", context.actorId()).put("reportedAt", now())
                    .put("source", text(input, "source", "WEB")).put("version", 1).put("createdAt", now()).put("updatedAt", now());
            copyIfPresent(report, input, "operationId", "remark");
            ObjectNode result = nextVersion(order).put("inputQty", nextInput)
                    .put("reportedGoodQty", add(text(order, "reportedGoodQty"), text(input, "goodQty")))
                    .put("reportedDefectQty", add(text(order, "reportedDefectQty"), text(input, "defectQty", "0")))
                    .put("reportedScrapQty", add(text(order, "reportedScrapQty"), text(input, "scrapQty", "0")));
            if (compare(text(result, "reportedScrapQty"), text(order, "plannedQty")) == 0) result.put("status", "COMPLETED");
            store.workReports.put(ProductionStore.key(context.tenantId(), text(report, "id")), report);
            store.workOrders.put(ProductionStore.key(context.tenantId(), workOrderId), result);
            transition(repository, context, "WorkReport", text(report, "id"), null, "SUBMITTED", 1, Map.of());
            transition(repository, context, "WorkReport", text(report, "id"), "SUBMITTED", "PROCESSING", 1, Map.of());
            transition(repository, context, "WorkReport", text(report, "id"), "PROCESSING", "POSTED", 1,
                    Map.of("workOrderId", workOrderId, "goodQty", text(input, "goodQty")), null, null,
                    text(order, "correlationId"));
            ObjectNode body = mapper.createObjectNode();
            body.set("report", report);
            body.set("workOrder", result);
            return created(body, "WorkReport", text(report, "id"));
        });
    }

    public Command correctReport(RequestContext context, String reportId, JsonNode input) {
        require(context, "production.work-order.report.correct");
        nonnegative(input, "goodQty"); nonnegative(input, "defectQty"); nonnegative(input, "scrapQty"); nonnegative(input, "inputQty");
        if (text(input, "reason").isBlank()) invalid("更正报工必须填写原因");
        ObjectNode payload = mapper.createObjectNode().put("reportId", reportId).setAll(object(input));
        return command(context, "CorrectWorkReport", payload, repository -> {
            JsonNode original = require(java.util.Optional.ofNullable(
                    store.workReports.get(ProductionStore.key(context.tenantId(), reportId))), "报工记录");
            requireStatus(original, "报工记录", "POSTED");
            requireVersion(context, version(original));
            JsonNode order = scopedWorkOrder(context, text(original, "workOrderId"));
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED");
            if (!store.inspections(context.tenantId(), text(order, "id")).isEmpty()) {
                invalid("已有质量送检记录，不能更正来源报工");
            }
            ObjectNode corrected = nextVersion(original).put("status", "CORRECTED");
            ObjectNode replacement = object(original).deepCopy().put("id", uuid()).put("goodQty", text(input, "goodQty"))
                    .put("defectQty", text(input, "defectQty", "0")).put("scrapQty", text(input, "scrapQty", "0"))
                    .put("inputQty", text(input, "inputQty", text(original, "inputQty"))).put("status", "POSTED")
                    .put("reportedBy", context.actorId()).put("reportedAt", now()).put("remark", text(input, "reason"))
                    .put("version", 1).put("createdAt", now()).put("updatedAt", now());
            ObjectNode correction = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("originalReportId", reportId).put("replacementReportId", text(replacement, "id"))
                    .put("reasonCode", text(input, "reasonCode")).put("reason", text(input, "reason"))
                    .put("status", "POSTED")
                    .put("createdBy", context.actorId()).put("createdAt", now());
            correction.set("originalSnapshot", original);
            correction.set("correctedSnapshot", replacement);
            ObjectNode updatedOrder = nextVersion(order)
                    .put("inputQty", add(subtract(text(order, "inputQty"), text(original, "inputQty")),
                            text(input, "inputQty", text(original, "inputQty"))))
                    .put("reportedGoodQty", add(subtract(text(order, "reportedGoodQty"), text(original, "goodQty")), text(input, "goodQty")))
                    .put("reportedDefectQty", add(subtract(text(order, "reportedDefectQty"), text(original, "defectQty")), text(input, "defectQty", "0")))
                    .put("reportedScrapQty", add(subtract(text(order, "reportedScrapQty"), text(original, "scrapQty")), text(input, "scrapQty", "0")));
            if (compare(add(text(updatedOrder, "reportedGoodQty"), text(updatedOrder, "reportedDefectQty"),
                    text(updatedOrder, "reportedScrapQty")), min(text(updatedOrder, "inputQty"), text(order, "plannedQty"))) > 0) {
                invalid("更正后累计报工数量超过投入量或计划量");
            }
            store.workReports.put(ProductionStore.key(context.tenantId(), reportId), corrected);
            store.workReports.put(ProductionStore.key(context.tenantId(), text(replacement, "id")), replacement);
            store.reportCorrections.put(ProductionStore.key(context.tenantId(), text(correction, "id")), correction);
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), updatedOrder);
            transition(repository, context, "WorkReport", reportId, "POSTED", "CORRECTING", version(corrected), Map.of());
            transition(repository, context, "WorkReport", reportId, "CORRECTING", "CORRECTED", version(corrected),
                    Map.of("replacementReportId", text(replacement, "id")), text(input, "reasonCode"), text(input, "reason"));
            audit(repository, context, "WORK_REPORT_CORRECT", "WorkReport", reportId, original, replacement, text(input, "reason"));
            ObjectNode body = mapper.createObjectNode();
            body.set("correction", correction);
            body.set("replacementReport", replacement);
            body.set("workOrder", updatedOrder);
            return created(body, "WorkReport", reportId);
        });
    }

    public List<JsonNode> inspections(RequestContext context, String workOrderId) {
        require(context, "production.quality.read");
        return store.transaction(context.tenantId(), repository -> store.inspections(context.tenantId(), workOrderId).stream()
                .filter(item -> context.canAccessFactory(text(
                        scopedOrderForFilter(context.tenantId(), text(item, "workOrderId")), "factoryResourceId")))
                .filter(item -> context.canAccessWarehouse(text(
                        scopedOrderForFilter(context.tenantId(), text(item, "workOrderId")).path("parameterSnapshot"),
                        "inventoryWarehouseId")))
                .toList());
    }

    public Command createInspection(RequestContext context, JsonNode input) {
        require(context, "production.quality.inspect");
        positive(input, "sampleQty");
        if (input.hasNonNull("parentInspectionId")) invalid("返工复检必须从返工单完成动作创建");
        return command(context, "CreateInspection", input, repository -> {
            JsonNode order = scopedWorkOrder(context, text(input, "workOrderId"));
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED", "COMPLETED");
            String inspectionQty = "0";
            for (JsonNode previous : store.inspections(context.tenantId(), text(order, "id"))) {
                if (!previous.hasNonNull("parentInspectionId")) inspectionQty = add(inspectionQty, text(previous, "sampleQty"));
            }
            if (compare(add(inspectionQty, text(input, "sampleQty")),
                    add(text(order, "reportedGoodQty"), text(order, "reportedDefectQty"))) > 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "送检数量超过未送检的良品与不良品报工量", "核对报工及已送检数量");
            }
            ObjectNode inspection = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", "FQC-" + codeSuffix()).put("workOrderId", text(order, "id")).put("inspectionType", "FQC")
                    .put("sampleQty", text(input, "sampleQty")).put("passedQty", "0").put("failedQty", "0")
                    .put("status", input.hasNonNull("parentInspectionId") ? "REINSPECTION" : "CREATED")
                    .put("createdBy", context.actorId()).put("version", 1).put("createdAt", now()).put("updatedAt", now());
            copyIfPresent(inspection, input, "parentInspectionId");
            store.inspections.put(ProductionStore.key(context.tenantId(), text(inspection, "id")), inspection);
            transition(repository, context, "Inspection", text(inspection, "id"), null, text(inspection, "status"), 1,
                    Map.of("workOrderId", text(order, "id"), "sampleQty", text(input, "sampleQty")));
            return created(inspection, "Inspection", text(inspection, "id"));
        });
    }

    public Command submitInspectionResult(RequestContext context, String id, JsonNode input) {
        require(context, "production.quality.inspect");
        nonnegative(input, "passedQty"); nonnegative(input, "failedQty");
        return command(context, "SubmitInspectionResult", payloadWithId(id, input), repository -> {
            JsonNode inspection = require(store.inspection(context.tenantId(), id), "检验单");
            requireStatus(inspection, "检验单", "CREATED", "REINSPECTION");
            requireVersion(context, version(inspection));
            String failed = text(input, "failedQty", "0");
            if (compare(add(text(input, "passedQty"), failed), text(inspection, "sampleQty")) != 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "检验合格量与不合格量之和必须等于送检量", "核对检验数量后提交");
            }
            ObjectNode result = nextVersion(inspection).put("passedQty", text(input, "passedQty")).put("failedQty", failed)
                    .put("inspectorId", context.actorId()).put("inspectedAt", now())
                    .put("status", compare(failed, "0") > 0 ? "DISPOSITION_PENDING" : "PASSED");
            copyIfPresent(result, input, "resultReason");
            store.inspections.put(ProductionStore.key(context.tenantId(), id), result);
            JsonNode order = scopedWorkOrder(context, text(inspection, "workOrderId"));
            String inspectedPassed = "0";
            for (JsonNode item : store.inspections(context.tenantId(), text(order, "id"))) {
                inspectedPassed = add(inspectedPassed, text(item, "passedQty"));
            }
            BigDecimal recovered = new BigDecimal(inspectedPassed).subtract(new BigDecimal(text(order, "reportedGoodQty")))
                    .max(BigDecimal.ZERO).min(new BigDecimal(text(order, "reportedDefectQty")));
            ObjectNode qualityOrder = nextVersion(order).put("qualityRecoveredQty", decimal(recovered));
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), qualityOrder);
            audit(repository, context, "QUALITY_RECOVERY", "WorkOrder", text(order, "id"), order, qualityOrder, null);
            if ("PASSED".equals(text(result, "status")) && result.hasNonNull("parentInspectionId")) {
                closeReworkParents(context.tenantId(), result);
            }
            transition(repository, context, "Inspection", id, text(inspection, "status"), "INSPECTING", version(inspection) + 1, Map.of());
            transition(repository, context, "Inspection", id, "INSPECTING", text(result, "status"), version(result),
                    Map.of("passedQty", text(input, "passedQty"), "failedQty", failed));
            audit(repository, context, "FQC_RESULT", "Inspection", id, inspection, result, text(input, "reason"));
            return updated(result, "Inspection", id);
        });
    }

    public Command createRework(RequestContext context, String id, JsonNode input) {
        require(context, "production.quality.disposition");
        return command(context, "CreateRework", payloadWithId(id, input), repository -> {
            JsonNode inspection = require(store.inspection(context.tenantId(), id), "检验单");
            requireStatus(inspection, "检验单", "DISPOSITION_PENDING");
            requireVersion(context, version(inspection));
            positive(input, "qty");
            if (compare(text(input, "qty"), text(inspection, "failedQty")) != 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "返工数量超过不合格数量", "调整返工数量");
            }
            ObjectNode rework = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", "RW-" + codeSuffix()).put("sourceInspectionId", id)
                    .put("workOrderId", text(inspection, "workOrderId")).put("qty", text(input, "qty"))
                    .put("status", "CREATED").put("createdBy", context.actorId()).put("createdAt", now());
            ObjectNode result = nextVersion(inspection).put("status", "REWORK");
            result.put("reworkOrderId", text(rework, "id"));
            store.reworkOrders.put(ProductionStore.key(context.tenantId(), text(rework, "id")), rework);
            store.inspections.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "Inspection", id, text(inspection, "status"), "REWORK", version(result),
                    Map.of("reworkOrderId", text(rework, "id")), "REWORK", text(input, "reason"));
            audit(repository, context, "FQC_REWORK", "Inspection", id, inspection, result, text(input, "reason"));
            ObjectNode body = mapper.createObjectNode();
            body.set("inspection", result);
            body.set("reworkOrder", rework);
            return created(body, "Inspection", id);
        });
    }

    public Command scrapInspection(RequestContext context, String id, JsonNode input) {
        require(context, "production.quality.disposition");
        return command(context, "ScrapInspection", payloadWithId(id, input), repository -> {
            JsonNode inspection = require(store.inspection(context.tenantId(), id), "检验单");
            requireStatus(inspection, "检验单", "DISPOSITION_PENDING");
            requireVersion(context, version(inspection));
            if (text(inspection, "inspectorId").equals(context.actorId())) {
                throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "检验人与报废审批人必须分离", "请由另一名质量主管审批报废");
            }
            if (compare(text(input, "qty"), text(inspection, "failedQty")) != 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "P0 报废处置必须覆盖本检验单全部不合格数量", "按不合格数量提交，或先走返工路径");
            }
            ObjectNode result = nextVersion(inspection).put("status", "SCRAPPED");
            JsonNode order = scopedWorkOrder(context, text(inspection, "workOrderId"));
            ObjectNode updatedOrder = nextVersion(order).put("qualityScrapQty",
                    add(text(order, "qualityScrapQty", "0"), text(input, "qty")));
            if (compare(add(text(order, "postedQty"), text(updatedOrder, "qualityScrapQty"),
                    text(order, "reportedScrapQty", "0")), text(order, "plannedQty")) >= 0) updatedOrder.put("status", "COMPLETED");
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), updatedOrder);
            store.inspections.put(ProductionStore.key(context.tenantId(), id), result);
            closeReworkParents(context.tenantId(), result);
            transition(repository, context, "Inspection", id, text(inspection, "status"), "SCRAP_PENDING", version(inspection) + 1,
                    Map.of("qty", text(input, "qty")), "SCRAP_APPROVAL", text(input, "reason"));
            transition(repository, context, "Inspection", id, "SCRAP_PENDING", "SCRAPPED", version(result),
                    Map.of("qty", text(input, "qty")), "SCRAPPED", text(input, "reason"));
            audit(repository, context, "FQC_SCRAP", "Inspection", id, inspection, result, text(input, "reason"));
            return updated(result, "Inspection", id);
        });
    }

    public Command completeRework(RequestContext context, String id, JsonNode input) {
        require(context, "production.work-order.report");
        return command(context, "CompleteRework", payloadWithId(id, input), repository -> {
            JsonNode rework = require(Optional.ofNullable(store.reworkOrders.get(ProductionStore.key(context.tenantId(), id))), "返工单");
            requireStatus(rework, "返工单", "CREATED");
            JsonNode parent = require(store.inspection(context.tenantId(), text(rework, "sourceInspectionId")), "原检验单");
            requireStatus(parent, "原检验单", "REWORK");
            ObjectNode inspection = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", "FQC-" + codeSuffix()).put("workOrderId", text(rework, "workOrderId"))
                    .put("parentInspectionId", text(parent, "id")).put("sampleQty", text(rework, "qty"))
                    .put("passedQty", "0").put("failedQty", "0").put("status", "REINSPECTION")
                    .put("version", 1).put("createdAt", now()).put("updatedAt", now()).put("createdBy", context.actorId());
            ObjectNode completed = copy(rework).put("status", "COMPLETED").put("completedBy", context.actorId())
                    .put("completedAt", now()).put("reinspectionId", text(inspection, "id"));
            store.reworkOrders.put(ProductionStore.key(context.tenantId(), id), completed);
            store.inspections.put(ProductionStore.key(context.tenantId(), text(inspection, "id")), inspection);
            store.inspections.put(ProductionStore.key(context.tenantId(), text(parent, "id")),
                    nextVersion(parent).put("reinspectionId", text(inspection, "id")));
            audit(repository, context, "REWORK_COMPLETE", "ReworkOrder", id, rework, completed, text(input, "remark"));
            transition(repository, context, "Inspection", text(inspection, "id"), null, "REINSPECTION", 1, Map.of("reworkOrderId", id));
            return created(inspection, "Inspection", text(inspection, "id"));
        });
    }

    private void closeReworkParents(String tenantId, JsonNode inspection) {
        String parentId = text(inspection, "parentInspectionId");
        while (!parentId.isBlank()) {
            JsonNode parent = require(store.inspection(tenantId, parentId), "返工来源检验单");
            store.inspections.put(ProductionStore.key(tenantId, parentId), nextVersion(parent).put("status", "REWORKED"));
            parentId = text(parent, "parentInspectionId");
        }
    }

    public Map<String, Object> allocationPreview(RequestContext context, String workOrderId, String qty) {
        JsonNode order = workOrder(context, workOrderId);
        return Map.of("workOrderId", workOrderId, "qty", qty, "allocations", calculateAllocations(order, qty, "PREVIEW"));
    }

    public Command createCompletion(RequestContext context, String workOrderId, JsonNode input) {
        require(context, "production.completion.post");
        positive(input, "qty");
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "CreateCompletion", payload, repository -> {
            JsonNode order = scopedWorkOrder(context, workOrderId);
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED", "COMPLETED");
            JsonNode inspection = require(store.inspection(context.tenantId(), text(input, "inspectionId")), "FQC 检验单");
            if (!text(inspection, "workOrderId").equals(workOrderId)) notFound("FQC 检验单");
            if (!Set.of("PASSED", "SCRAPPED", "REWORKED").contains(text(inspection, "status"))) {
                throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "FQC 未通过或处置未关闭，禁止完工入库", "完成 FQC 并确保结果为 PASSED");
            }
            if (!text(input, "uom").equals(text(order, "uom"))
                    || !text(input, "inventoryWarehouseId").equals(text(order.path("parameterSnapshot"), "inventoryWarehouseId"))) {
                invalid("完工入库单位或仓库与工单不一致");
            }
            String inspectionCompleted = "0";
            String orderCompleted = "0";
            for (JsonNode previous : store.completions(context.tenantId(), workOrderId)) {
                if (!Set.of("POSTING", "POSTED", "FAILED").contains(text(previous, "status"))) continue;
                orderCompleted = add(orderCompleted, text(previous, "qty"));
                if (text(previous, "inspectionId").equals(text(inspection, "id"))) {
                    inspectionCompleted = add(inspectionCompleted, text(previous, "qty"));
                }
            }
            if (compare(add(inspectionCompleted, text(input, "qty")), text(inspection, "passedQty")) > 0
                    || compare(add(orderCompleted, text(input, "qty")),
                            add(text(order, "reportedGoodQty"), text(order, "qualityRecoveredQty", "0"))) > 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "累计完工入库超过检验合格量或报工良品量", "核对已有完工任务，失败任务使用原任务重试");
            }
            String completionId = uuid();
            String taskId = uuid();
            ObjectNode completion = mapper.createObjectNode().put("id", completionId).put("tenantId", context.tenantId())
                    .put("code", "CMP-" + codeSuffix()).put("workOrderId", workOrderId)
                    .put("inspectionId", text(inspection, "id")).put("qty", text(input, "qty")).put("uom", text(input, "uom"))
                    .put("warehouseResourceId", text(input, "warehouseResourceId"))
                    .put("inventoryWarehouseId", text(input, "inventoryWarehouseId")).put("traceMode", text(input, "traceMode"))
                    .put("productionDate", text(input, "productionDate"))
                    .put("allocationRevision", input.path("allocationRevision").asInt()).put("status", "POSTING")
                    .put("inventoryIdempotencyKey", "inventory-completion:" + context.tenantId() + ":" + completionId)
                    .put("taskId", taskId).put("createdBy", context.actorId()).put("version", 1)
                    .put("createdAt", now()).put("updatedAt", now());
            completion.set("serialNumbers", input.withArray("serialNumbers").deepCopy());
            copyIfPresent(completion, input, "binId", "batchNo", "remark");
            ObjectNode task = mapper.createObjectNode().put("id", taskId).put("tenantId", context.tenantId())
                    .put("taskType", "FINISHED_GOODS_RECEIPT").put("aggregateType", "Completion")
                    .put("aggregateId", completionId).put("status", "RUNNING").put("progress", 20).put("retryCount", 0)
                    .put("maxRetryCount", 4).put("traceId", context.traceId()).put("createdBy", context.actorId())
                    .put("createdAt", now()).put("updatedAt", now());
            task.set("input", mapper.createObjectNode().put("completionId", completionId)
                    .put("inventoryIdempotencyKey", text(completion, "inventoryIdempotencyKey")));
            store.completions.put(ProductionStore.key(context.tenantId(), completionId), completion);
            store.tasks.put(ProductionStore.key(context.tenantId(), taskId), task);
            transition(repository, context, "Completion", completionId, null, "SUBMITTED", 1,
                    Map.of("workOrderId", workOrderId, "qty", text(input, "qty")));
            transition(repository, context, "Completion", completionId, "SUBMITTED", "POSTING", 1,
                    Map.of("workOrderId", workOrderId, "qty", text(input, "qty"), "taskId", taskId), null, null,
                    text(order, "correlationId"));
            audit(repository, context, "COMPLETION_SUBMIT", "Completion", completionId, null, completion, text(input, "remark"));
            outbox(repository, "production.completion.requested.v1", "Completion", completionId, 1,
                    text(order, "correlationId"), context, Map.of(
                            "completionId", completionId, "workOrderId", workOrderId,
                            "externalTransactionId", "production-completion:" + context.tenantId() + ":" + completionId,
                            "warehouseId", text(completion, "inventoryWarehouseId"), "productId", text(order, "productId"),
                            "qty", text(completion, "qty"), "uom", text(completion, "uom"),
                            "allocations", calculateAllocations(order, text(completion, "qty"), completionId)));
            ObjectNode body = mapper.createObjectNode().put("completionId", completionId).put("taskId", taskId)
                    .put("status", "POSTING").put("idempotencyKey", context.idempotencyKey()).put("traceId", context.traceId());
            return new Command(202, body, "Completion", completionId, false);
        });
    }

    public JsonNode completion(RequestContext context, String id) {
        require(context, "production.completion.read");
        return store.transaction(context.tenantId(), repository -> {
        JsonNode value = require(store.completion(context.tenantId(), id), "完工记录");
        scopedWorkOrder(context, text(value, "workOrderId"));
        return object(value).set("allocations", mapper.valueToTree(store.completionAllocations(context.tenantId(), id)));
        });
    }

    public Command inventoryResult(RequestContext context, String id, JsonNode input) {
        require(context, "production.inventory.callback");
        ObjectNode payload = mapper.createObjectNode().put("id", id).setAll(object(input));
        return command(context, "InventoryCompletionResult", payload, repository -> {
            JsonNode completion = require(store.completion(context.tenantId(), id), "完工记录");
            if ("POSTED".equals(text(completion, "status")) && "POSTED".equals(text(input, "result"))
                    && text(completion, "externalTransactionId").equals(text(input, "externalTransactionId"))) {
                return updated(completion, "Completion", id);
            }
            requireStatus(completion, "完工记录", "POSTING");
            JsonNode task = require(store.task(context.tenantId(), text(completion, "taskId")), "完工任务");
            if ("UNKNOWN".equals(text(input, "result"))) {
                ObjectNode retryTask = copy(task).put("status", "RETRY_WAIT")
                        .put("retryCount", task.path("retryCount").asInt() + 1)
                        .put("errorCode", "INVENTORY_RESULT_UNKNOWN")
                        .put("errorMessage", "库存结果暂时未知，保留原幂等关系查询").put("updatedAt", now());
                store.tasks.put(ProductionStore.key(context.tenantId(), text(task, "id")), retryTask);
                audit(repository, context, "INVENTORY_RESULT_UNKNOWN", "OperationTask", text(task, "id"), task, retryTask, null);
                ObjectNode unknownBody = copy(completion);
                unknownBody.set("task", retryTask);
                return new Command(202, unknownBody, "Completion", id, false);
            }
            if ("REJECTED".equals(text(input, "result"))) {
                ObjectNode result = nextVersion(completion).put("status", "FAILED")
                        .put("failureCode", text(input, "failureCode", "INVENTORY_REJECTED"))
                        .put("failureMessage", text(input, "failureMessage", "库存明确拒绝入库"));
                ObjectNode failedTask = copy(task).put("status", "MANUAL_INTERVENTION")
                        .put("errorCode", text(result, "failureCode")).put("errorMessage", text(result, "failureMessage"))
                        .put("updatedAt", now());
                store.completions.put(ProductionStore.key(context.tenantId(), id), result);
                store.tasks.put(ProductionStore.key(context.tenantId(), text(task, "id")), failedTask);
                transition(repository, context, "Completion", id, "POSTING", "FAILED", version(result), Map.of(),
                        text(result, "failureCode"), text(result, "failureMessage"));
                audit(repository, context, "COMPLETION_REJECTED", "Completion", id, completion, result, text(result, "failureMessage"));
                return updated(result, "Completion", id);
            }
            if (text(input, "externalTransactionId").isBlank()) invalid("库存确认成功时必须返回唯一库存流水号");
            JsonNode order = scopedWorkOrder(context, text(completion, "workOrderId"));
            ObjectNode result = nextVersion(completion).put("status", "POSTED")
                    .put("externalTransactionId", text(input, "externalTransactionId")).put("postedAt", now());
            result.remove("failureCode");
            result.remove("failureMessage");
            ObjectNode updatedOrder = nextVersion(order).put("postedQty", add(text(order, "postedQty"), text(completion, "qty")));
            if (compare(add(text(updatedOrder, "postedQty"), text(order, "qualityScrapQty", "0"),
                    text(order, "reportedScrapQty", "0")), text(order, "plannedQty")) >= 0) updatedOrder.put("status", "COMPLETED");
            List<JsonNode> allocations = calculateAllocations(order, text(completion, "qty"), id);
            store.completions.put(ProductionStore.key(context.tenantId(), id), result);
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), updatedOrder);
            allocations.forEach(value -> store.completionAllocations.put(
                    ProductionStore.key(context.tenantId(), text(value, "id")), copy(value)));
            ObjectNode succeededTask = copy(task).put("status", "SUCCEEDED").put("progress", 100).put("updatedAt", now());
            succeededTask.set("result", mapper.createObjectNode().put("externalTransactionId", text(input, "externalTransactionId")));
            store.tasks.put(ProductionStore.key(context.tenantId(), text(task, "id")), succeededTask);
            transition(repository, context, "Completion", id, "POSTING", "POSTED", version(result),
                    Map.of("workOrderId", text(order, "id"), "qty", text(completion, "qty"),
                            "externalTransactionId", text(input, "externalTransactionId")), null, null,
                    text(order, "correlationId"));
            {
                outbox(repository, "production.completion.posted.v1", "Completion", id, version(result),
                        text(order, "correlationId"), context, Map.of(
                                "completionId", id, "workOrderId", text(order, "id"),
                                "externalTransactionId", text(input, "externalTransactionId"),
                                "warehouseId", text(completion, "inventoryWarehouseId"), "productId", text(order, "productId"),
                                "qty", text(completion, "qty"), "uom", text(completion, "uom"),
                                "productionDate", text(completion, "productionDate"), "allocations", allocations));
            }
            if (!text(order, "status").equals(text(updatedOrder, "status"))) {
                transition(repository, context, "WorkOrder", text(order, "id"), text(order, "status"),
                        text(updatedOrder, "status"), version(updatedOrder), Map.of("postedQty", text(updatedOrder, "postedQty")),
                        null, null, text(order, "correlationId"));
            }
            audit(repository, context, "COMPLETION_POSTED", "Completion", id, completion, result, null);
            ObjectNode body = mapper.createObjectNode();
            body.set("completion", result);
            body.set("workOrder", updatedOrder);
            body.set("allocations", mapper.valueToTree(allocations));
            return updated(body, "Completion", id);
        });
    }

    public Command retryCompletion(RequestContext context, String id, JsonNode input) {
        require(context, "production.completion.retry");
        return command(context, "RetryCompletion", payloadWithId(id, input), repository -> {
            JsonNode completion = require(store.completion(context.tenantId(), id), "完工记录");
            requireStatus(completion, "完工记录", "FAILED");
            JsonNode task = require(store.task(context.tenantId(), text(completion, "taskId")), "完工任务");
            ObjectNode result = nextVersion(completion).put("status", "POSTING")
                    .put("binId", text(input, "binId", text(completion, "binId")))
                    .put("batchNo", text(input, "batchNo", text(completion, "batchNo")))
                    .put("remark", text(input, "remark", text(completion, "remark")));
            result.remove("failureCode");
            result.remove("failureMessage");
            ObjectNode retryTask = copy(task).put("status", "RUNNING")
                    .put("retryCount", task.path("retryCount").asInt() + 1).put("progress", 20).put("updatedAt", now());
            retryTask.remove("errorCode");
            retryTask.remove("errorMessage");
            store.completions.put(ProductionStore.key(context.tenantId(), id), result);
            store.tasks.put(ProductionStore.key(context.tenantId(), text(task, "id")), retryTask);
            transition(repository, context, "Completion", id, "FAILED", "POSTING", version(result), Map.of(), "RETRY", text(input, "remark"));
            audit(repository, context, "COMPLETION_RETRY", "Completion", id, completion, result, text(input, "remark"));
            JsonNode order = scopedWorkOrder(context, text(completion, "workOrderId"));
            outbox(repository, "production.completion.requested.v1", "Completion", id, version(result),
                    text(order, "correlationId"), context, Map.of(
                            "completionId", id, "workOrderId", text(order, "id"),
                            "externalTransactionId", "production-completion:" + context.tenantId() + ":" + id,
                            "warehouseId", text(completion, "inventoryWarehouseId"), "productId", text(order, "productId"),
                            "qty", text(completion, "qty"), "uom", text(completion, "uom"),
                            "allocations", calculateAllocations(order, text(completion, "qty"), id)));
            ObjectNode body = mapper.createObjectNode().put("completionId", id).put("taskId", text(completion, "taskId"))
                    .put("status", "POSTING").put("inventoryIdempotencyKey", text(completion, "inventoryIdempotencyKey"));
            return new Command(202, body, "Completion", id, false);
        });
    }

    public Map<String, Object> closeCheck(RequestContext context, String workOrderId) {
        require(context, "production.close.read");
        return closeCheck(scopedWorkOrder(context, workOrderId));
    }

    public Command closeSubmit(RequestContext context, String workOrderId, JsonNode input) {
        require(context, "production.close.submit");
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "SubmitWorkOrderClose", payload, repository -> {
            JsonNode order = scopedWorkOrder(context, workOrderId);
            requireStatus(order, "工单", "COMPLETED");
            requireVersion(context, version(order));
            Map<String, Object> check = closeCheck(order);
            if (Boolean.FALSE.equals(check.get("canClose"))) {
                throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "工单仍存在未关闭事项，不能提交结案",
                        "逐项处理结案检查中的阻断项", check);
            }
            ObjectNode close = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("workOrderId", workOrderId).put("status", "REVIEW_PENDING")
                    .put("submittedBy", context.actorId()).put("submittedAt", now()).put("version", 1)
                    .put("createdAt", now()).put("updatedAt", now());
            close.set("checkSnapshot", mapper.valueToTree(check));
            close.set("varianceSnapshot", input.has("varianceSnapshot") ? input.get("varianceSnapshot") : mapper.createObjectNode());
            copyIfPresent(close, input, "reason");
            ObjectNode updatedOrder = nextVersion(order).put("status", "CLOSING");
            store.closeRequests.put(ProductionStore.key(context.tenantId(), text(close, "id")), close);
            store.workOrders.put(ProductionStore.key(context.tenantId(), workOrderId), updatedOrder);
            transition(repository, context, "WorkOrder", workOrderId, "COMPLETED", "CLOSING", version(updatedOrder),
                    Map.of("closeRequestId", text(close, "id")));
            audit(repository, context, "WORK_ORDER_CLOSE_SUBMIT", "WorkOrder", workOrderId, order, updatedOrder, text(input, "reason"));
            return created(close, "WorkOrderClose", text(close, "id"));
        });
    }

    public Command approveClose(RequestContext context, String closeId, JsonNode input) {
        require(context, "production.close.approve");
        return command(context, "ApproveWorkOrderClose", payloadWithId(closeId, input), repository -> {
            JsonNode close = require(java.util.Optional.ofNullable(
                    store.closeRequests.get(ProductionStore.key(context.tenantId(), closeId))), "结案申请");
            requireStatus(close, "结案申请", "REVIEW_PENDING");
            requireVersion(context, version(close));
            if (text(close, "submittedBy").equals(context.actorId())) {
                throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "结案制单人与复核人必须为不同账号", "请由另一名具备结案复核权限的人员操作");
            }
            JsonNode order = scopedWorkOrder(context, text(close, "workOrderId"));
            requireStatus(order, "工单", "CLOSING");
            Map<String, Object> check = closeCheck(order);
            if (Boolean.FALSE.equals(check.get("canClose"))) {
                throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "复核时发现新的未关闭事项", "处理阻断项后重新复核", check);
            }
            ObjectNode result = nextVersion(close).put("status", "APPROVED").put("approvedBy", context.actorId()).put("approvedAt", now());
            ObjectNode updatedOrder = nextVersion(order).put("status", "CLOSED");
            store.closeRequests.put(ProductionStore.key(context.tenantId(), closeId), result);
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), updatedOrder);
            transition(repository, context, "WorkOrder", text(order, "id"), "CLOSING", "CLOSED", version(updatedOrder),
                    Map.of("closeRequestId", closeId));
            audit(repository, context, "WORK_ORDER_CLOSE_APPROVE", "WorkOrder", text(order, "id"), order, updatedOrder, text(input, "remark"));
            ObjectNode body = mapper.createObjectNode();
            body.set("closeRequest", result);
            body.set("workOrder", updatedOrder);
            return updated(body, "WorkOrderClose", closeId);
        });
    }

    public Command startPlanningTask(RequestContext context, String type, JsonNode input) {
        require(context, "MRP".equals(type) ? "production.mrp.run" : "production.aps.run");
        Optional<Command> replay = replay(context, "Start" + type + "Task", input);
        if (replay.isPresent()) return replay.get();
        List<JsonNode> shortages = new ArrayList<>();
        Set<String> uniqueDemands = new java.util.HashSet<>();
        Map<String, BigDecimal> plannedConsumption = new LinkedHashMap<>();
        for (JsonNode demandId : input.withArray("demandIds")) {
            if (demandId.asText().isBlank() || !uniqueDemands.add(demandId.asText())) invalid("计划任务需求编号不能为空或重复");
            JsonNode demand = store.transaction(context.tenantId(), repository ->
                    scopedDemand(context, demandId.asText()));
            JsonNode bom = store.transaction(context.tenantId(), repository ->
                    require(store.bom(context.tenantId(), text(demand, "productId")), "生效 BOM"));
            if (inventoryPort == null) unavailableInventory();
            for (JsonNode value : inventoryPort.check(context.tenantId(), materialRequirements(bom, text(demand, "qty")))) {
                ObjectNode line = value.deepCopy();
                String materialKey = text(line, "warehouseId") + ":" + text(line, "materialId");
                BigDecimal available = new BigDecimal(text(line, "availableQty")).subtract(
                        plannedConsumption.getOrDefault(materialKey, BigDecimal.ZERO)).max(BigDecimal.ZERO);
                BigDecimal required = new BigDecimal(text(line, "grossRequiredQty"));
                plannedConsumption.merge(materialKey, required, BigDecimal::add);
                line.put("availableQty", decimal(available)).put("shortageQty", decimal(required.subtract(available).max(BigDecimal.ZERO)))
                        .put("demandId", text(demand, "id")).put("demandCode", text(demand, "code"))
                        .put("requiredDate", text(demand, "dueDate"));
                if (line.path("factMissing").asBoolean() || new BigDecimal(text(line, "shortageQty")).signum() > 0) shortages.add(line);
            }
        }
        if ("APS".equals(type) && !shortages.isEmpty()) {
            throw new ApiException(409, "PRODUCTION_409_MATERIAL_SHORTAGE", "物料不齐套，不能运行 APS", "根据 MRP 缺料补足库存后重试",
                    Map.of("materialShortages", shortages));
        }
        return command(context, "Start" + type + "Task", input, repository -> {
            ArrayNode demandIds = input.withArray("demandIds");
            if (demandIds.isEmpty()) invalid(type + " 任务必须指定生产需求");
            List<JsonNode> demands = new ArrayList<>();
            for (JsonNode demandId : demandIds) {
                JsonNode demand = scopedDemand(context, demandId.asText());
                requireStatus(demand, "计划任务关联需求", "MRP".equals(type) ? new String[]{"APPROVED", "PLANNED"} : new String[]{"PLANNED"});
                if (!text(demand, "workOrderId").isBlank()) invalid("需求已生成工单，不能重复展算或排程");
                if ("MRP".equals(type) && text(demand, "acceptedAt").isBlank()) {
                    throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "生产需求尚未由计划员接收", "具备接收权限的计划员先认领需求");
                }
                demands.add(demand);
            }
            String taskId = uuid();
            ObjectNode result = mapper.createObjectNode()
                    .put("solver", "MRP".equals(type) ? "REFERENCE_MPS_MRP_V2" : "REFERENCE_APS_V1").put("completedAt", now());
            ArrayNode mpsLines = arrayNode();
            for (JsonNode demand : demands) {
                mpsLines.add(mapper.createObjectNode().put("demandId", text(demand, "id")).put("demandCode", text(demand, "code"))
                        .put("productId", text(demand, "productId")).put("plannedQty", text(demand, "qty"))
                        .put("uom", text(demand, "uom")).put("dueDate", text(demand, "dueDate")));
            }
            if ("MRP".equals(type)) {
                result.put("canProceedToAps", shortages.isEmpty());
                result.set("mpsLines", mpsLines);
                result.set("materialShortages", mapper.valueToTree(shortages));
                for (JsonNode demand : demands) {
                    ObjectNode planned = nextVersion(demand).put("status", "PLANNED").put("mrpTaskId", taskId);
                    planned.remove("scheduleCandidateId");
                    planned.remove("scheduleTaskId");
                    store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")), planned);
                    transition(repository, context, "Demand", text(demand, "id"), text(demand, "status"), "PLANNED",
                            version(planned), Map.of("taskId", taskId));
                }
            } else {
                ObjectNode candidate = mapper.createObjectNode().put("id", uuid()).put("startAt", now()).put("published", true)
                        .put("dueDate", demands.stream().map(value -> text(value, "dueDate")).min(String::compareTo).orElse(""));
                candidate.set("demandIds", demandIds.deepCopy());
                for (JsonNode demand : demands) {
                    store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")),
                            nextVersion(demand).put("scheduleCandidateId", text(candidate, "id")).put("scheduleTaskId", taskId));
                }
                result.set("scheduleCandidates", arrayNode().add(candidate));
            }
            ObjectNode task = mapper.createObjectNode().put("id", taskId).put("tenantId", context.tenantId())
                    .put("taskType", type + "_RUN").put("status", "SUCCEEDED").put("progress", 100).put("retryCount", 0)
                    .put("maxRetryCount", 4).put("traceId", context.traceId())
                    .put("createdBy", context.actorId()).put("createdAt", now()).put("updatedAt", now());
            task.set("input", input);
            task.set("result", result);
            store.tasks.put(ProductionStore.key(context.tenantId(), taskId), task);
            transition(repository, context, "OperationTask", taskId, "PENDING", "RUNNING", 1, Map.of());
            transition(repository, context, "OperationTask", taskId, "RUNNING", "SUCCEEDED", 1,
                    Map.of("taskType", type + "_RUN"));
            ObjectNode body = mapper.createObjectNode().put("taskId", taskId).put("status", "SUCCEEDED").put("progress", 100)
                    .put("traceId", context.traceId());
            body.set("result", result);
            return new Command(202, body, "OperationTask", taskId, false);
        });
    }

    public Map<String, Object> dashboard(RequestContext context) {
        require(context, "production.dashboard.read");
        List<JsonNode> orders = store.workOrders(context.tenantId(), null, null, null, Integer.MAX_VALUE, 0);
        List<JsonNode> demands = store.demands(context.tenantId(), null, null, null, Integer.MAX_VALUE, 0);
        orders = orders.stream().filter(item -> context.canAccessFactory(text(item, "factoryResourceId")))
                .filter(item -> context.canAccessWarehouse(text(item.path("parameterSnapshot"), "inventoryWarehouseId"))).toList();
        demands = demands.stream().filter(item -> context.canAccessFactory(text(item, "factoryResourceId")))
                .filter(item -> text(item, "inventoryWarehouseId").isBlank()
                        || context.canAccessWarehouse(text(item, "inventoryWarehouseId"))).toList();
        List<JsonNode> inspections = store.inspections(context.tenantId(), null);
        List<JsonNode> active = orders.stream()
                .filter(item -> !Set.of("CLOSED", "CANCELLED").contains(text(item, "status"))).toList();
        String today = LocalDate.now().toString();
        List<JsonNode> atRisk = active.stream()
                .filter(item -> text(item, "dueDate").compareTo(today) < 0 && !"COMPLETED".equals(text(item, "status"))).toList();
        BigDecimal planned = active.stream().map(item -> new BigDecimal(text(item, "plannedQty"))).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal posted = active.stream().map(item -> new BigDecimal(text(item, "postedQty"))).reduce(BigDecimal.ZERO, BigDecimal::add);
        double rate = planned.compareTo(BigDecimal.ZERO) > 0
                ? posted.multiply(BigDecimal.valueOf(100)).divide(planned, 2, RoundingMode.DOWN).doubleValue() : 0;
        return Map.of(
                "kpis", Map.of(
                        "activeWorkOrders", active.size(), "overdueWorkOrders", atRisk.size(),
                        "completionRatePercent", rate,
                        "pendingDemands", demands.stream().filter(item -> Set.of("RECEIVED", "VALIDATING", "PENDING_REVIEW", "BLOCKED")
                                .contains(text(item, "status"))).count(),
                        "openFqc", inspections.stream().filter(item -> !Set.of("PASSED", "SCRAPPED", "REWORKED").contains(text(item, "status"))).count()
                ),
                "risks", atRisk.stream().limit(20).map(item -> Map.of(
                        "type", "OVERDUE_WORK_ORDER", "workOrderId", text(item, "id"), "code", text(item, "code"),
                        "dueDate", text(item, "dueDate"), "status", text(item, "status")
                )).toList(),
                "updatedAt", now(), "dataScope", Map.of("tenantId", context.tenantId())
        );
    }

    private Command command(RequestContext context, String type, JsonNode input, Function<ProductionStore, Command> work) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少 X-Idempotency-Key",
                    "为本次业务动作生成稳定且唯一的幂等键后重试");
        }
        String hash = hash(input);
        return store.transaction(context.tenantId(), repository -> {
        Optional<JsonNode> existing = store.idempotency(context.tenantId(), type, context.idempotencyKey());
        if (existing.isPresent()) {
            if (!existing.get().path("requestHash").asText().equals(hash)) {
                throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同请求内容", "请勿复用其他业务动作的幂等键");
            }
            return new Command(existing.get().path("statusCode").asInt(), existing.get().path("body"), null, null, true);
        }
            Command result = work.apply(repository);
            ObjectNode record = mapper.createObjectNode().put("requestHash", hash)
                    .put("statusCode", result.statusCode());
            record.set("body", result.body());
            store.idempotency.put(ProductionStore.key(context.tenantId(), type, context.idempotencyKey()),
                    record);
            return result;
        });
    }

    private Optional<Command> replay(RequestContext context, String type, JsonNode input) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) invalid("写操作缺少 X-Idempotency-Key");
        return store.transaction(context.tenantId(), repository -> store.idempotency(context.tenantId(), type, context.idempotencyKey())
                .map(record -> {
                    if (!record.path("requestHash").asText().equals(hash(input))) {
                        throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT", "同一幂等键对应不同请求", "使用原请求重试");
                    }
                    return new Command(record.path("statusCode").asInt(), record.path("body"), null, null, true);
                }));
    }

    private void transition(ProductionStore repository, RequestContext context, String type, String id, String from,
                            String to, int version, Map<String, ?> payload) {
        transition(repository, context, type, id, from, to, version, payload, null, null, null);
    }

    private void transition(ProductionStore repository, RequestContext context, String type, String id, String from,
                            String to, int version, Map<String, ?> payload, String reasonCode, String reason) {
        transition(repository, context, type, id, from, to, version, payload, reasonCode, reason, null);
    }

    private void transition(ProductionStore repository, RequestContext context, String type, String id, String from,
                            String to, int version, Map<String, ?> payload, String reasonCode, String reason,
                            String correlationId) {
        String occurredAt = now();
        ObjectNode history = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                .put("aggregateType", type).put("aggregateId", id);
        putIfPresent(history, "fromStatus", from);
        history.put("toStatus", to);
        putIfPresent(history, "reasonCode", reasonCode);
        putIfPresent(history, "reason", reason);
        history.put("actorId", context.actorId()).put("traceId", context.traceId()).put("occurredAt", occurredAt);
        history.set("metadata", mapper.valueToTree(payload));
        ObjectNode event = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                .put("eventId", uuid()).put("eventType", type + "." + to).put("eventVersion", 1)
                .put("aggregateType", type).put("aggregateId", id).put("aggregateVersion", version);
        putIfPresent(event, "correlationId", correlationId);
        ObjectNode eventPayload = mapper.createObjectNode()
                .put("fromStatus", from).put("toStatus", to).put("occurredAt", occurredAt)
                .setAll(objectNode(mapper.valueToTree(payload)));
        event.put("traceId", context.traceId()).put("status", "PENDING").put("retryCount", 0).put("createdAt", occurredAt);
        event.set("payload", eventPayload);
        repository.statusHistory.add(history);
        repository.outboxEvents.add(event);
    }

    private void outbox(ProductionStore repository, String type, String aggregateType, String aggregateId, int version,
                        String correlationId, RequestContext context, Map<String, ?> payload) {
        ObjectNode event = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                .put("eventId", uuid()).put("eventType", type).put("eventVersion", 1).put("aggregateType", aggregateType)
                .put("aggregateId", aggregateId).put("aggregateVersion", version).put("correlationId", correlationId)
                .put("traceId", context.traceId()).put("status", "PENDING")
                .put("retryCount", 0).put("createdAt", now());
        event.set("payload", mapper.valueToTree(payload));
        repository.outboxEvents.add(event);
    }

    private void audit(ProductionStore repository, RequestContext context, String action, String type, String id,
                       JsonNode before, JsonNode after, String reason) {
        ObjectNode log = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId()).put("action", action)
                .put("aggregateType", type).put("aggregateId", id).put("actorAccountId", context.actorId())
                .put("permissionVersion", "unknown");
        if (before != null) log.set("beforeSnapshot", before);
        if (after != null) log.set("afterSnapshot", after);
        putIfPresent(log, "reason", reason);
        log.put("traceId", context.traceId()).put("occurredAt", now());
        repository.auditLogs.add(log);
    }

    private Map<String, Object> closeCheck(JsonNode order) {
        List<Map<String, String>> blockers = new ArrayList<>();
        String status = text(order, "status");
        if (!"COMPLETED".equals(status) && !"CLOSING".equals(status)) {
            blockers.add(Map.of("code", "WORK_ORDER_NOT_COMPLETED", "message", "工单状态为 " + status,
                    "repairAction", "完成生产、检验及入库后再结案"));
        }
        if (store.inspections(contextTenant(order), text(order, "id")).stream()
                .anyMatch(item -> !Set.of("PASSED", "SCRAPPED", "REWORKED").contains(text(item, "status")))) {
            blockers.add(Map.of("code", "FQC_OPEN", "message", "存在未关闭 FQC", "repairAction", "完成检验或质量处置"));
        }
        if (store.completions(contextTenant(order), text(order, "id")).stream()
                .anyMatch(item -> Set.of("POSTING", "FAILED", "REVERSING").contains(text(item, "status")))) {
            blockers.add(Map.of("code", "COMPLETION_OPEN", "message", "存在未确定完工任务", "repairAction", "完成库存任务"));
        }
        if (compare(add(text(order, "postedQty"), text(order, "qualityScrapQty", "0"),
                text(order, "reportedScrapQty", "0")), text(order, "plannedQty")) != 0) {
            blockers.add(Map.of("code", "QUANTITY_NOT_SETTLED", "message", "入库与报废数量未覆盖计划量", "repairAction", "完成成品入库或质量处置"));
        }
        if (store.materialBlocked(contextTenant(order), text(order, "id"))) {
            blockers.add(Map.of("code", "MATERIAL_TRANSACTION_OPEN", "message", "投退料未关闭", "repairAction", "完成库存对账"));
        }
        return Map.of("canClose", blockers.isEmpty(), "blockers", blockers, "checkedAt", now());
    }

    private List<Map<String, String>> releaseBlockers(JsonNode order) {
        List<Map<String, String>> blockers = new ArrayList<>();
        if (!order.hasNonNull("bomSnapshotId")) blockers.add(Map.of("code", "BOM_SNAPSHOT_MISSING",
                "message", "缺少生效 BOM 快照", "repairAction", "选择有效 BOM 后重新生成工单快照"));
        if (!order.hasNonNull("routingSnapshotId")) blockers.add(Map.of("code", "ROUTING_SNAPSHOT_MISSING",
                "message", "缺少生效工艺快照", "repairAction", "选择有效工艺路线后重新生成快照"));
        if (!order.hasNonNull("scheduleCandidateId")) blockers.add(Map.of("code", "APS_NOT_PUBLISHED",
                "message", "APS 排程尚未发布", "repairAction", "完成排程并发布候选方案"));
        if (!"READY".equals(text(order, "kittingStatus")) || !order.hasNonNull("materialReservation")) blockers.add(Map.of("code", "KITTING_NOT_READY",
                "message", "物料齐套状态为 " + text(order, "kittingStatus", "未检查"),
                "repairAction", "重新执行齐套检查并完成库存预占"));
        return blockers;
    }

    private List<JsonNode> calculateAllocations(JsonNode order, String quantity, String completionId) {
        List<JsonNode> links = store.workOrderDemands.values().stream()
                .filter(item -> text(item, "tenantId").equals(contextTenant(order))
                        && text(item, "workOrderId").equals(text(order, "id")))
                .map(ProductionStore::copy).toList();
        if (links.isEmpty()) return List.of();
        Map<String, BigDecimal> already = new LinkedHashMap<>();
        for (JsonNode completion : store.completions(contextTenant(order), text(order, "id"))) {
            if (!"POSTED".equals(text(completion, "status"))) continue;
            for (JsonNode allocation : store.completionAllocations(contextTenant(order), text(completion, "id"))) {
                already.merge(text(allocation, "demandId"), new BigDecimal(text(allocation, "qty")), BigDecimal::add);
            }
        }
        BigDecimal remaining = new BigDecimal(quantity);
        List<JsonNode> result = new ArrayList<>();
        List<JsonNode> sorted = new ArrayList<>(links);
        sorted.sort(Comparator.comparing((JsonNode item) -> !item.path("customerLocked").asBoolean())
                .thenComparingInt(item -> item.path("priorityRank").asInt())
                .thenComparing(item -> text(item, "promisedDate", "9999"))
                .thenComparing(item -> text(item, "demandId")));
        for (JsonNode link : sorted) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal capacity = new BigDecimal(text(link, "allocatedQty"))
                    .subtract(already.getOrDefault(text(link, "demandId"), BigDecimal.ZERO));
            if (capacity.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal allocated = capacity.min(remaining);
            ObjectNode allocation = mapper.createObjectNode().put("id", uuid()).put("tenantId", contextTenant(order))
                    .put("completionId", completionId).put("demandId", text(link, "demandId"))
                    .put("qty", allocated.toPlainString()).put("rank", result.size() + 1)
                    .put("createdAt", now());
            allocation.set("ruleEvidence", mapper.createObjectNode()
                            .put("customerLocked", link.path("customerLocked").asBoolean())
                            .put("priorityRank", link.path("priorityRank").asInt())
                            .put("promisedDate", text(link, "promisedDate", ""))
                            .put("deterministicTieBreak", text(link, "demandId")))
                    ;
            result.add(allocation);
            remaining = remaining.subtract(allocated);
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "完工数量超过工单需求分配的剩余数量",
                    "调整完工数量或先修订需求 pegging", Map.of("unallocatedQty", remaining.toPlainString()));
        }
        return result;
    }

    private Command changeWorkOrder(RequestContext context, String id, String type, String permission,
                                    String nextStatus, JsonNode input) {
        require(context, permission);
        String allowed = "PAUSED".equals(nextStatus) ? "IN_PROGRESS" : "StartWorkOrder".equals(type) ? "RELEASED" : "PAUSED";
        return command(context, type, payloadWithId(id, input), repository -> {
            JsonNode order = scopedWorkOrder(context, id);
            requireStatus(order, "工单", allowed);
            requireVersion(context, version(order));
            ObjectNode result = nextVersion(order).put("status", nextStatus);
            store.workOrders.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "WorkOrder", id, text(order, "status"), nextStatus, version(result), Map.of(),
                    null, text(input, "reason"), text(order, "correlationId"));
            audit(repository, context, type, "WorkOrder", id, order, result, text(input, "reason"));
            return updated(result, "WorkOrder", id);
        });
    }

    private JsonNode demandWithSource(JsonNode demand) {
        Optional<JsonNode> source = store.demandSource(text(demand, "tenantId"), text(demand, "id"));
        if (source.isEmpty()) return demand;
        ObjectNode result = copy(demand);
        result.set("source", source.get());
        return result;
    }

    private Object availabilityResult(RequestContext context, JsonNode input, boolean duplicate, String projection) {
        JsonNode availability = store.inventoryAvailability(context.tenantId(), text(input, "productId"),
                text(input, "inventoryWarehouseId")).orElse(null);
        return mapper.createObjectNode().put("duplicate", duplicate).put("projectionResult", projection)
                .set("availability", availability);
    }

    private ObjectNode nextVersion(JsonNode value) {
        return copy(value).put("version", version(value) + 1).put("updatedAt", now());
    }

    public List<JsonNode> completions(RequestContext context, String workOrderId) {
        require(context, "production.completion.read");
        return store.transaction(context.tenantId(), repository -> store.completions(context.tenantId(), workOrderId).stream()
                .filter(item -> context.canAccessFactory(text(
                        scopedOrderForFilter(context.tenantId(), text(item, "workOrderId")), "factoryResourceId")))
                .filter(item -> context.canAccessWarehouse(text(
                        scopedOrderForFilter(context.tenantId(), text(item, "workOrderId")).path("parameterSnapshot"),
                        "inventoryWarehouseId")))
                .toList());
    }

    public List<JsonNode> closes(RequestContext context) {
        require(context, "production.close.read");
        return store.transaction(context.tenantId(), repository -> store.closeRequests.values().stream()
                .filter(value -> context.tenantId().equals(text(value, "tenantId")))
                .filter(value -> context.canAccessFactory(text(
                        scopedOrderForFilter(context.tenantId(), text(value, "workOrderId")), "factoryResourceId")))
                .filter(value -> context.canAccessWarehouse(text(
                        scopedOrderForFilter(context.tenantId(), text(value, "workOrderId")).path("parameterSnapshot"),
                        "inventoryWarehouseId")))
                .map(ProductionStore::copy).toList());
    }

    public List<JsonNode> listBoms(RequestContext context) {
        if (!context.has("production.bom.manage") && !context.has("production.demand.review")) {
            require(context, "production.bom.manage");
        }
        return store.transaction(context.tenantId(), repository -> store.bomSnapshots.values().stream()
                .filter(bom -> context.tenantId().equals(text(bom, "tenantId")))
                .sorted(java.util.Comparator.comparing(bom -> text(bom, "productId")))
                .map(bom -> (JsonNode) bom.deepCopy()).toList());
    }

    public Command saveBom(RequestContext context, JsonNode input) {
        require(context, "production.bom.manage");
        if (text(input, "productId").isBlank() || text(input, "routingSnapshotId").isBlank()
                || input.withArray("lines").isEmpty()) invalid("BOM 必须包含产品、工艺快照及物料行");
        JsonNode routing = input.path("routingSnapshot");
        if (!text(input, "routingSnapshotId").equals(text(routing, "id"))
                || !text(input, "productId").equals(text(routing, "productId"))
                || !routing.path("operations").isArray() || routing.path("operations").isEmpty()) {
            invalid("工艺快照必须与产品及关联编号一致，且包含工序");
        }
        Set<String> operationCodes = new java.util.HashSet<>();
        int previousSequence = 0;
        for (JsonNode operation : routing.path("operations")) {
            int sequence = operation.path("sequence").asInt();
            if (!operation.path("sequence").isIntegralNumber() || sequence <= previousSequence
                    || text(operation, "code").isBlank() || text(operation, "name").isBlank()
                    || text(operation, "workCenterResourceId").isBlank()
                    || !operationCodes.add(text(operation, "code"))) invalid("工序须按正整数顺序排列，编码唯一，名称和工作中心必填");
            positive(operation, "standardMinutes");
            previousSequence = sequence;
        }
        Set<String> keys = new java.util.HashSet<>();
        for (JsonNode line : input.withArray("lines")) {
            positive(line, "qtyPer");
            if (text(line, "materialId").isBlank() || text(line, "warehouseId").isBlank()
                    || text(line, "uom").isBlank() || !keys.add(text(line, "warehouseId") + ":" + text(line, "materialId"))) {
                invalid("BOM 物料行必须唯一且包含仓库和单位");
            }
        }
        return command(context, "SaveBom", input, repository -> {
            JsonNode current = store.bom(context.tenantId(), text(input, "productId")).orElse(null);
            if (current != null) requireVersion(context, version(current));
            ObjectNode bom = copy(input).put("id", uuid()).put("tenantId", context.tenantId())
                    .put("version", current == null ? 1 : version(current) + 1).put("updatedAt", now())
                    .put("publishedBy", context.actorId()).put("status", "EFFECTIVE");
            store.bomSnapshots.put(ProductionStore.key(context.tenantId(), text(input, "productId")), bom);
            audit(repository, context, "BOM_PUBLISH", "BomSnapshot", text(bom, "id"), current, bom, null);
            return created(bom, "BomSnapshot", text(bom, "id"));
        });
    }

    private List<JsonNode> materialRequirements(JsonNode bom, String qty) {
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode line : bom.withArray("lines")) {
            ObjectNode requirement = copy(line);
            requirement.put("grossRequiredQty", decimal(new BigDecimal(text(line, "qtyPer")).multiply(new BigDecimal(qty))));
            result.add(requirement);
        }
        if (result.isEmpty()) invalid("BOM 未包含物料，不能齐套检查");
        return result;
    }

    private void unavailableInventory() {
        throw new ApiException(503, "PRODUCTION_503_INVENTORY_UNAVAILABLE", "库存服务不可用", "恢复库存服务后重试");
    }

    private void positive(JsonNode value, String field) {
        nonnegative(value, field);
        if (new BigDecimal(text(value, field, "0")).signum() <= 0) invalid(field + " 必须大于 0");
    }

    private void nonnegative(JsonNode value, String field) {
        if (!text(value, field, "0").matches("^(0|[1-9]\\d*)(\\.\\d{1,6})?$")) invalid(field + " 必须为非负十进制字符串");
    }

    private static String decimal(BigDecimal value) { return value.stripTrailingZeros().toPlainString(); }

    private Command created(JsonNode body, String type, String id) { return new Command(201, body, type, id, false); }
    private Command updated(JsonNode body, String type, String id) { return new Command(200, body, type, id, false); }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "缺少操作权限：" + permission,
                    "请联系平台管理员授予对应生产权限");
        }
    }

    private void requireVersion(RequestContext context, int current) {
        if (context.expectedVersion() != null && context.expectedVersion() != current) {
            throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "数据已被其他用户更新", "请刷新数据后重新确认本次操作",
                    Map.of("expectedVersion", context.expectedVersion(), "currentVersion", current));
        }
    }

    private void requireStatus(JsonNode value, String label, String... allowed) {
        if (value.path("archived").asBoolean()) invalid(label + "已归档，不能执行业务操作");
        if (!Arrays.asList(allowed).contains(text(value, "status"))) {
            throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE",
                    label + "当前状态 " + text(value, "status") + " 不允许此操作",
                    "请先将状态推进到：" + String.join(" / ", allowed), Map.of("allowedStatuses", allowed));
        }
    }

    private JsonNode require(Optional<JsonNode> value, String label) {
        return value.orElseThrow(() -> new ApiException(404, "PRODUCTION_404_NOT_FOUND",
                label + "不存在或不在当前数据范围内", "请刷新列表并确认租户与数据权限"));
    }

    private JsonNode require(Optional<JsonNode> value, String label, int status, String code) {
        return value.orElseThrow(() -> new ApiException(status, code, label + "不存在", "请同步依赖数据后重试"));
    }

    private void requireDate(JsonNode value, String field) {
        try { LocalDate.parse(value.path(field).asText()); } catch (Exception exception) { invalid(field + " 必须使用 YYYY-MM-DD"); }
    }

    private void invalid(String message) {
        throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, "检查请求字段后重试");
    }

    private void notFound(String label) {
        throw new ApiException(404, "PRODUCTION_404_NOT_FOUND", label + "不存在", "请刷新列表后重试");
    }

    private void forbidden(String message, String suggestion) {
        throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", message, suggestion);
    }

    private ObjectNode payloadWithId(String id, JsonNode input) {
        return mapper.createObjectNode().put("id", id).setAll(object(input));
    }

    private void copyIfPresent(ObjectNode target, JsonNode source, String... fields) {
        for (String field : fields) if (source.hasNonNull(field)) target.set(field, source.get(field).deepCopy());
    }

    private void putIfPresent(ObjectNode target, String field, String value) {
        if (value != null && !value.isBlank()) target.put(field, value);
    }

    private Map<String, Object> pageResult(List<?> items, int total) {
        return Map.of("items", items, "total", total);
    }

    private int version(JsonNode value) { return value.path("version").asInt(); }
    private String contextTenant(JsonNode value) { return text(value, "tenantId"); }
    private String text(JsonNode value, String field) {
        JsonNode node = value.get(field);
        return node == null || node.isNull() ? "" : node.asText();
    }
    private String text(JsonNode value, String field, String fallback) {
        return value.hasNonNull(field) ? value.get(field).asText() : fallback;
    }
    private ArrayNode arrayNode() { return mapper.createArrayNode(); }
    private ObjectNode object(JsonNode value) { return value.isObject() ? (ObjectNode) value : mapper.createObjectNode(); }
    private ObjectNode objectNode(JsonNode value) { return object(value); }
    private ObjectNode copy(JsonNode value) { return object(value).deepCopy(); }
    private String uuid() { return UUID.randomUUID().toString(); }
    private String now() { return Instant.now().toString(); }
    private String codeSuffix() { return Long.toString(System.currentTimeMillis(), 36).toUpperCase() + uuid().substring(0, 4).toUpperCase(); }

    private BigDecimal decimal(String value) { return new BigDecimal(value); }
    private int compare(String left, String right) { return decimal(left).compareTo(decimal(right)); }
    private String add(String... values) {
        BigDecimal result = BigDecimal.ZERO;
        for (String value : values) result = result.add(decimal(value));
        return result.toPlainString();
    }
    private String subtract(String left, String right) { return decimal(left).subtract(decimal(right)).toPlainString(); }
    private String min(String left, String right) { return compare(left, right) <= 0 ? left : right; }

    private String hash(JsonNode value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(stable(value).toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private Object stable(JsonNode value) {
        if (value.isObject()) {
            TreeMap<String, Object> result = new TreeMap<>();
            Iterator<Map.Entry<String, JsonNode>> fields = value.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                result.put(field.getKey(), stable(field.getValue()));
            }
            return result;
        }
        if (value.isArray()) {
            List<Object> result = new ArrayList<>();
            value.forEach(item -> result.add(stable(item)));
            return result;
        }
        return value.isNull() ? null : value.asText();
    }
}
