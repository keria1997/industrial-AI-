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

    public ProductionService(ProductionStore store, ObjectMapper mapper) {
        this.store = store;
        this.mapper = mapper;
    }

    public Map<String, Object> readiness(RequestContext context) {
        return Map.of(
                "status", "READY", "module", "production", "apiVersion", "v1",
                "tenantId", context.tenantId(),
                "checks", Map.of("repository", "UP", "eventOutbox", "UP", "platformCapability", "ASSUMED_BY_GATEWAY"),
                "timestamp", now()
        );
    }

    public Map<String, Object> listDemands(RequestContext context, String status, String factoryResourceId,
                                           String search, int page, int pageSize) {
        List<JsonNode> all = store.demands(context.tenantId(), status, factoryResourceId, search, Integer.MAX_VALUE, 0);
        return pageResult(all.stream().map(this::demandWithSource).skip((long) (page - 1) * pageSize).limit(pageSize).toList(), all.size());
    }

    public Map<String, Object> listWorkOrders(RequestContext context, String status, String factoryResourceId,
                                              String search, int page, int pageSize) {
        List<JsonNode> all = store.workOrders(context.tenantId(), status, factoryResourceId, search, Integer.MAX_VALUE, 0);
        return pageResult(all.stream().skip((long) (page - 1) * pageSize).limit(pageSize).toList(), all.size());
    }

    public JsonNode workOrder(RequestContext context, String id) {
        return require(store.workOrder(context.tenantId(), id), "工单");
    }

    public JsonNode task(RequestContext context, String id) {
        return require(store.task(context.tenantId(), id), "任务");
    }

    public JsonNode salesOrderIntake(RequestContext context, String salesOrderId, String sourceLineId, int sourceRevision) {
        JsonNode value = store.salesOrderIntakes.get(ProductionStore.key(
                context.tenantId(), salesOrderId, sourceLineId, String.valueOf(sourceRevision)
        ));
        return require(Optional.ofNullable(value).map(node -> node.deepCopy()), "销售订单接入记录");
    }

    public Object receiveInventoryAvailability(RequestContext context, JsonNode input) {
        require(context, "production.inventory.sync");
        return store.transaction((ProductionStore repository) -> {
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
        return command(context, "CreateDemand", input, repository -> {
            ObjectNode demand = mapper.createObjectNode()
                    .put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", text(input, "code", "DM-" + codeSuffix()))
                    .put("sourceType", text(input, "sourceType")).put("productId", text(input, "productId"));
            copyIfPresent(demand, input, "productName");
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
            if (intake.hasNonNull("demandId")) body.set("demand", store.demand(context.tenantId(), text(intake, "demandId")).orElse(null));
            return created(body, "SalesOrderIntake", text(intake, "id"));
        });
    }

    public Command validateDemand(RequestContext context, String id, JsonNode input) {
        require(context, "production.demand.review");
        ObjectNode payload = payloadWithId(id, input);
        return command(context, "ValidateDemand", payload, repository -> {
            JsonNode demand = require(store.demand(context.tenantId(), id), "需求");
            requireStatus(demand, "需求", "RECEIVED", "BLOCKED");
            requireVersion(context, version(demand));
            ArrayNode missing = arrayNode();
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
            JsonNode demand = require(store.demand(context.tenantId(), id), "需求");
            requireStatus(demand, "需求", "PENDING_REVIEW");
            requireVersion(context, version(demand));
            if (text(demand, "createdBy").equals(context.actorId())) {
                throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "需求制单人不能审批本人创建的需求", "请由另一名具备审批权限的人员操作");
            }
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
            JsonNode demand = require(store.demand(context.tenantId(), id), "需求");
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
            ObjectNode order = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", text(input, "code", "WO-" + codeSuffix())).put("productId", text(input, "productId"));
            copyIfPresent(order, input, "productName", "workshopResourceId", "lineResourceId", "bomSnapshotId",
                    "routingSnapshotId", "scheduleCandidateId", "assigneeEmployeeId", "correlationId");
            order.put("factoryResourceId", text(input, "factoryResourceId"))
                    .put("workCenterResourceId", text(input, "workCenterResourceId"))
                    .put("plannedQty", text(input, "plannedQty")).put("inputQty", text(input, "inputQty", "0"))
                    .put("reportedGoodQty", "0").put("reportedDefectQty", "0").put("reportedScrapQty", "0")
                    .put("postedQty", "0").put("uom", text(input, "uom")).put("dueDate", text(input, "dueDate"))
                    .put("status", input.hasNonNull("bomSnapshotId") && input.hasNonNull("routingSnapshotId") ? "PLANNED" : "DRAFT")
                    .put("correlationId", text(input, "correlationId", uuid()))
                    .put("createdBy", context.actorId()).put("version", 1).put("createdAt", now()).put("updatedAt", now());
            ObjectNode parameterSnapshot = mapper.createObjectNode()
                    .put("inventoryWarehouseId", text(input, "inventoryWarehouseId"));
            parameterSnapshot.set("demandIds", links.deepCopy());
            order.set("parameterSnapshot", parameterSnapshot);
            store.workOrders.put(ProductionStore.key(context.tenantId(), text(order, "id")), order);
            for (int index = 0; index < links.size(); index++) {
                JsonNode link = links.get(index);
                JsonNode demand = require(store.demand(context.tenantId(), text(link, "demandId")), "关联需求");
                requireStatus(demand, "关联需求", "PLANNED");
                if (index == 0) {
                    JsonNode source = store.demandSource(context.tenantId(), text(demand, "id")).orElse(null);
                    String demandWarehouse = source == null ? ""
                            : text(source.path("payloadSnapshot"), "inventoryWarehouseId");
                    if (demandWarehouse.isBlank() && source != null) {
                        demandWarehouse = text(source.path("payloadSnapshot"), "warehouseId");
                    }
                    if (text(input, "inventoryWarehouseId").isBlank() && !demandWarehouse.isBlank()) {
                        ((ObjectNode) input).put("inventoryWarehouseId", demandWarehouse);
                    }
                }
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

    public Command releaseWorkOrder(RequestContext context, String id, JsonNode input) {
        require(context, "production.work-order.release");
        return command(context, "ReleaseWorkOrder", payloadWithId(id, input), repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), id), "工单");
            requireStatus(order, "工单", "PLANNED", "SCHEDULED", "KITTING");
            requireVersion(context, version(order));
            ObjectNode result = nextVersion(order).put("status", "RELEASED");
            store.workOrders.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "WorkOrder", id, text(order, "status"), "RELEASED", version(result), Map.of(),
                    null, text(input, "reason"), text(order, "correlationId"));
            audit(repository, context, "WORK_ORDER_RELEASE", "WorkOrder", id, order, result, text(input, "reason"));
            return updated(result, "WorkOrder", id);
        });
    }

    public Command startWorkOrder(RequestContext context, String id, JsonNode input) {
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
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "SubmitWorkReport", payload, repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), workOrderId), "工单");
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
        ObjectNode payload = mapper.createObjectNode().put("reportId", reportId).setAll(object(input));
        return command(context, "CorrectWorkReport", payload, repository -> {
            JsonNode original = require(java.util.Optional.ofNullable(
                    store.workReports.get(ProductionStore.key(context.tenantId(), reportId))), "报工记录");
            requireStatus(original, "报工记录", "POSTED");
            JsonNode order = require(store.workOrder(context.tenantId(), text(original, "workOrderId")), "工单");
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED", "COMPLETED");
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
        return store.inspections(context.tenantId(), workOrderId);
    }

    public Command createInspection(RequestContext context, JsonNode input) {
        require(context, "production.quality.inspect");
        return command(context, "CreateInspection", input, repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), text(input, "workOrderId")), "工单");
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED", "COMPLETED");
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
            if (compare(text(input, "qty"), text(inspection, "failedQty")) > 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "返工数量超过不合格数量", "调整返工数量");
            }
            ObjectNode rework = mapper.createObjectNode().put("id", uuid()).put("tenantId", context.tenantId())
                    .put("code", "RW-" + codeSuffix()).put("sourceInspectionId", id)
                    .put("workOrderId", text(inspection, "workOrderId")).put("qty", text(input, "qty"))
                    .put("status", "CREATED").put("createdBy", context.actorId()).put("createdAt", now());
            ObjectNode result = nextVersion(inspection).put("status", "REWORK");
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
            if (text(inspection, "inspectorId").equals(context.actorId())) {
                throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "检验人与报废审批人必须分离", "请由另一名质量主管审批报废");
            }
            if (compare(text(input, "qty"), text(inspection, "failedQty")) != 0) {
                throw new ApiException(422, "PRODUCTION_422_QUANTITY_VIOLATION", "P0 报废处置必须覆盖本检验单全部不合格数量", "按不合格数量提交，或先走返工路径");
            }
            ObjectNode result = nextVersion(inspection).put("status", "SCRAPPED");
            store.inspections.put(ProductionStore.key(context.tenantId(), id), result);
            transition(repository, context, "Inspection", id, text(inspection, "status"), "SCRAP_PENDING", version(inspection) + 1,
                    Map.of("qty", text(input, "qty")), "SCRAP_APPROVAL", text(input, "reason"));
            transition(repository, context, "Inspection", id, "SCRAP_PENDING", "SCRAPPED", version(result),
                    Map.of("qty", text(input, "qty")), "SCRAPPED", text(input, "reason"));
            audit(repository, context, "FQC_SCRAP", "Inspection", id, inspection, result, text(input, "reason"));
            return updated(result, "Inspection", id);
        });
    }

    public Map<String, Object> allocationPreview(RequestContext context, String workOrderId, String qty) {
        JsonNode order = workOrder(context, workOrderId);
        return Map.of("workOrderId", workOrderId, "qty", qty, "allocations", calculateAllocations(order, qty, "PREVIEW"));
    }

    public Command createCompletion(RequestContext context, String workOrderId, JsonNode input) {
        require(context, "production.completion.post");
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "CreateCompletion", payload, repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), workOrderId), "工单");
            requireStatus(order, "工单", "IN_PROGRESS", "PAUSED", "COMPLETED");
            JsonNode inspection = require(store.inspection(context.tenantId(), text(input, "inspectionId")), "FQC 检验单");
            if (!text(inspection, "workOrderId").equals(workOrderId)) notFound("FQC 检验单");
            if (!"PASSED".equals(text(inspection, "status"))) {
                throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "FQC 未通过或处置未关闭，禁止完工入库", "完成 FQC 并确保结果为 PASSED");
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
            ObjectNode body = mapper.createObjectNode().put("completionId", completionId).put("taskId", taskId)
                    .put("status", "POSTING").put("idempotencyKey", context.idempotencyKey()).put("traceId", context.traceId());
            return new Command(202, body, "Completion", completionId, false);
        });
    }

    public JsonNode completion(RequestContext context, String id) {
        JsonNode value = require(store.completion(context.tenantId(), id), "完工记录");
        return object(value).set("allocations", mapper.valueToTree(store.completionAllocations(context.tenantId(), id)));
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
            JsonNode order = require(store.workOrder(context.tenantId(), text(completion, "workOrderId")), "工单");
            ObjectNode result = nextVersion(completion).put("status", "POSTED")
                    .put("externalTransactionId", text(input, "externalTransactionId")).put("postedAt", now());
            result.remove("failureCode");
            result.remove("failureMessage");
            ObjectNode updatedOrder = nextVersion(order).put("postedQty", add(text(order, "postedQty"), text(completion, "qty")));
            if (compare(text(updatedOrder, "postedQty"), text(order, "plannedQty")) >= 0) updatedOrder.put("status", "COMPLETED");
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
            if (!allocations.isEmpty()) {
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
            ObjectNode body = mapper.createObjectNode().put("completionId", id).put("taskId", text(completion, "taskId"))
                    .put("status", "POSTING").put("inventoryIdempotencyKey", text(completion, "inventoryIdempotencyKey"));
            return new Command(202, body, "Completion", id, false);
        });
    }

    public Map<String, Object> closeCheck(RequestContext context, String workOrderId) {
        return closeCheck(require(store.workOrder(context.tenantId(), workOrderId), "工单"));
    }

    public Command closeSubmit(RequestContext context, String workOrderId, JsonNode input) {
        require(context, "production.close.submit");
        ObjectNode payload = mapper.createObjectNode().put("workOrderId", workOrderId).setAll(object(input));
        return command(context, "SubmitWorkOrderClose", payload, repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), workOrderId), "工单");
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
            if (text(close, "submittedBy").equals(context.actorId())) {
                throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "结案制单人与复核人必须为不同账号", "请由另一名具备结案复核权限的人员操作");
            }
            JsonNode order = require(store.workOrder(context.tenantId(), text(close, "workOrderId")), "工单");
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
        return command(context, "Start" + type + "Task", input, repository -> {
            ArrayNode demandIds = input.withArray("demandIds");
            if (demandIds.isEmpty()) invalid(type + " 任务必须指定生产需求");
            List<JsonNode> demands = new ArrayList<>();
            for (JsonNode demandId : demandIds) {
                JsonNode demand = require(store.demand(context.tenantId(), demandId.asText()), "计划任务关联需求");
                requireStatus(demand, "计划任务关联需求", "MRP".equals(type) ? "APPROVED" : "PLANNED");
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
                result.put("canProceedToAps", true);
                result.set("mpsLines", mpsLines);
                result.set("materialShortages", arrayNode());
                for (JsonNode demand : demands) {
                    ObjectNode planned = nextVersion(demand).put("status", "PLANNED").put("mrpTaskId", taskId);
                    store.demands.put(ProductionStore.key(context.tenantId(), text(demand, "id")), planned);
                    transition(repository, context, "Demand", text(demand, "id"), text(demand, "status"), "PLANNED",
                            version(planned), Map.of("taskId", taskId));
                }
            } else {
                ObjectNode candidate = mapper.createObjectNode().put("id", uuid()).put("startAt", now()).put("published", true);
                candidate.set("demandIds", demandIds.deepCopy());
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
        List<JsonNode> orders = store.workOrders(context.tenantId(), null, null, null, Integer.MAX_VALUE, 0);
        List<JsonNode> demands = store.demands(context.tenantId(), null, null, null, Integer.MAX_VALUE, 0);
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
                        "openFqc", inspections.stream().filter(item -> !Set.of("PASSED", "SCRAPPED").contains(text(item, "status"))).count()
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
        Optional<JsonNode> existing = store.idempotency(context.tenantId(), type, context.idempotencyKey());
        if (existing.isPresent()) {
            if (!existing.get().path("requestHash").asText().equals(hash)) {
                throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同请求内容", "请勿复用其他业务动作的幂等键");
            }
            return new Command(existing.get().path("statusCode").asInt(), existing.get().path("body"), null, null, true);
        }
        return store.transaction(repository -> {
            Command result = work.apply(repository);
            ObjectNode record = mapper.createObjectNode().put("requestHash", hash)
                    .put("statusCode", result.statusCode());
            record.set("body", result.body());
            store.idempotency.put(ProductionStore.key(context.tenantId(), type, context.idempotencyKey()),
                    record);
            return result;
        });
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
                .anyMatch(item -> !Set.of("PASSED", "SCRAPPED").contains(text(item, "status")))) {
            blockers.add(Map.of("code", "FQC_OPEN", "message", "存在未关闭 FQC", "repairAction", "完成检验或质量处置"));
        }
        if (store.completions(contextTenant(order), text(order, "id")).stream()
                .anyMatch(item -> Set.of("POSTING", "FAILED", "REVERSING").contains(text(item, "status")))) {
            blockers.add(Map.of("code", "COMPLETION_OPEN", "message", "存在未确定完工任务", "repairAction", "完成库存任务"));
        }
        if (compare(text(order, "postedQty"), "0") <= 0) {
            blockers.add(Map.of("code", "NO_POSTED_COMPLETION", "message", "没有已入库完工数量", "repairAction", "完成成品入库"));
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
        if (!"READY".equals(text(order, "kittingStatus"))) blockers.add(Map.of("code", "KITTING_NOT_READY",
                "message", "物料齐套状态为 " + text(order, "kittingStatus", "未检查"),
                "repairAction", "重新执行齐套检查并完成库存预占"));
        return blockers;
    }

    private List<JsonNode> calculateAllocations(JsonNode order, String quantity, String completionId) {
        List<JsonNode> links = store.workOrderDemands.values().stream()
                .filter(item -> text(item, "tenantId").equals(contextTenant(order))
                        && text(item, "workOrderId").equals(text(order, "id")))
                .map(ProductionStore::copy).toList();
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
        String allowed = "PAUSED".equals(nextStatus) ? "IN_PROGRESS" : nextStatus;
        return command(context, type, payloadWithId(id, input), repository -> {
            JsonNode order = require(store.workOrder(context.tenantId(), id), "工单");
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
