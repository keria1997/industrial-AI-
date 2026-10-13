package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.fulfillment.FulfillmentService;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.production.ProductionService;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.production.ProductionFulfillmentOutboxWorker;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import java.util.List;

public class BusinessLinkAudit20261013 {
    static final ObjectMapper M = new ObjectMapper();
    static final String TENANT = "TENANT-AUDIT";
    static RequestContext ctx(String actor, String key, Integer version) {
        return new RequestContext(TENANT, actor, List.of("*"), "audit-20261013", key, version);
    }
    static JsonNode json(String value) throws Exception { return M.readTree(value); }
    static void evidence(String name, Object value) throws Exception {
        System.out.println(name + "=" + M.writeValueAsString(value));
    }
    static void complete(ProductionService service, ProductionStore store, JsonNode released, String prefix) throws Exception {
        String id = released.path("id").asText();
        try {
            service.startWorkOrder(ctx("maker", prefix + "-start", 2), id, json("{}"));
            throw new AssertionError("Expected RELEASED -> IN_PROGRESS to be blocked");
        } catch (ApiException error) {
            evidence(prefix + "_START_RELEASED_ORDER", java.util.Map.of("status", error.status(), "message", error.getMessage()));
        }
        // Prepare only the downstream unit fixture; this does not count as a passing production flow.
        ObjectNode started = released.deepCopy();
        started.put("status", "IN_PROGRESS");
        store.workOrders.put(ProductionStore.key(TENANT, id), started);
        evidence(prefix + "_DOWNSTREAM_FIXTURE", "IN_PROGRESS set in isolated memory only");
        service.submitReport(ctx("maker", prefix + "-report", started.path("version").asInt()), id,
                json("{\"goodQty\":\"10\",\"defectQty\":\"0\",\"scrapQty\":\"0\",\"inputQty\":\"0\",\"uom\":\"PCS\"}"));
        JsonNode inspection = service.createInspection(ctx("inspector", prefix + "-inspection", null),
                json("{\"workOrderId\":\"" + id + "\",\"sampleQty\":\"10\"}")).body();
        service.submitInspectionResult(ctx("inspector", prefix + "-result", 1),
                inspection.path("id").asText(), json("{\"passedQty\":\"10\",\"failedQty\":\"0\"}"));
        JsonNode completion = service.createCompletion(ctx("maker", prefix + "-complete", null), id,
                json("""
                    {"inspectionId":"%s","qty":"10","uom":"PCS","warehouseResourceId":"RES-WH",
                     "inventoryWarehouseId":"WH-AUDIT","traceMode":"NONE","productionDate":"2026-10-13",
                     "allocationRevision":1}
                    """.formatted(inspection.path("id").asText()))).body();
        service.inventoryResult(ctx("warehouse", prefix + "-posted", null), completion.path("completionId").asText(),
                json("{\"result\":\"POSTED\",\"externalTransactionId\":\"" + prefix + "-TX\"}"));
    }
    static void multipleShortageLines() throws Exception {
        ProductionStore ps = new ProductionStore();
        ProductionService production = new ProductionService(ps, M);
        FulfillmentStore fs = new FulfillmentStore();
        FulfillmentService fulfillment = new FulfillmentService(fs, M, "AUDIT",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
        fulfillment.setProductionTaskReader(ps::task);
        fulfillment.setProductionDemandCreator((context, input) -> production.createDemand(context, input).body());
        ObjectNode orderInput = (ObjectNode) json("""
            {"customerId":"AUDIT-CUSTOMER","ownerEmployeeId":"maker","fulfillmentWarehouseId":"WH-MULTI",
             "factoryResourceId":"FAC-SH-01","requestedDeliveryDate":"2026-11-30",
             "allowPartialShipment":true,"currency":"CNY",
             "recipient":{"name":"Audit","phone":"13800138001","country":"CN","province":"Shanghai",
                          "city":"Shanghai","address":"Audit"},
             "lines":[
               {"lineNo":1,"productId":"FG001","orderedQty":"10","uom":"PCS","unitPrice":"1",
                "taxRate":"0","promisedDate":"2026-11-30","allowPartialShipment":true},
               {"lineNo":2,"productId":"FG002","orderedQty":"10","uom":"PCS","unitPrice":"1",
                "taxRate":"0","promisedDate":"2026-11-30","allowPartialShipment":true}]}
            """);
        JsonNode order = fulfillment.createOrder(ctx("maker", "multi-so", null), orderInput).body();
        String orderId = order.path("id").asText();
        fulfillment.decideReview(ctx("reviewer", "multi-review", 1), orderId, json("{\"decision\":\"APPROVE\"}"));
        order = fulfillment.confirmOrder(ctx("maker", "multi-confirm", 2), orderId,
                json("{\"requestedDeliveryDate\":\"2026-11-30\"}")).body();
        ObjectNode shipInput = M.createObjectNode().put("warehouseId", "WH-MULTI");
        var shipLines = shipInput.putArray("lines");
        for (JsonNode line : order.path("lines")) {
            shipLines.addObject().put("orderLineId", line.path("id").asText())
                    .put("sourceLineRevision", line.path("version").asInt()).put("requestedQty", "10").put("uom", "PCS");
        }
        fulfillment.createShipmentRequest(ctx("maker", "multi-ship", 3), orderId, shipInput);
        JsonNode task = fs.shipmentTasks(TENANT).get(0);
        String taskId = task.path("id").asText();
        ObjectNode reserveInput = M.createObjectNode().put("shipmentRequestId", task.path("shipmentRequestId").asText())
                .put("orderRevision", task.path("orderRevision").asInt());
        task = fulfillment.checkAndReserve(ctx("warehouse", "multi-reserve", 1), taskId, reserveInput).body().path("task");
        ObjectNode requestInput = M.createObjectNode();
        var requestLines = requestInput.putArray("lines");
        for (JsonNode line : task.path("lines")) {
            requestLines.addObject().put("shipmentRequestLineId", line.path("shipmentRequestLineId").asText())
                    .put("orderLineId", line.path("orderLineId").asText()).put("factoryResourceId", "FAC-SH-01")
                    .put("dueDate", "2026-11-30");
        }
        try {
            fulfillment.createProductionRequest(ctx("warehouse", "multi-production", task.path("version").asInt()),
                    taskId, requestInput);
            throw new AssertionError("Expected multi-line production request to conflict");
        } catch (ApiException error) {
            evidence("MULTI_LINE_PRODUCTION_REQUEST", java.util.Map.of("status", error.status(),
                    "code", error.code(), "message", error.getMessage(),
                    "persistedDemandCount", ps.demands(TENANT, null, null, null, 100, 0).size()));
        }
    }
    public static void main(String[] args) throws Exception {
        ProductionStore ps = new ProductionStore();
        ProductionService production = new ProductionService(ps, M);
        FulfillmentStore fs = new FulfillmentStore();
        FulfillmentService fulfillment = new FulfillmentService(fs, M, "AUDIT",
                "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
        fulfillment.setProductionTaskReader(ps::task);
        fulfillment.setProductionDemandCreator((context, input) -> production.createDemand(context, input).body());
        ObjectNode demandInput = (ObjectNode) json("""
            {"code":"DM-AUDIT","sourceType":"MANUAL","productId":"FG001","qty":"10",
             "uom":"PCS","dueDate":"2026-11-30","factoryResourceId":"FAC-SH-01"}
            """);
        JsonNode demand = production.createDemand(ctx("maker", "d-create", null), demandInput).body();
        String demandId = demand.path("id").asText();
        demand = production.validateDemand(ctx("maker", "d-validate", 1), demandId, json("{}")).body();
        demand = production.approveDemand(ctx("reviewer", "d-approve", 2), demandId, json("{}")).body();
        demand = production.claimDemand(ctx("reviewer", "d-claim", 3), demandId).body();
        ObjectNode run = M.createObjectNode();
        run.putArray("demandIds").add(demandId);
        JsonNode mrp = production.startPlanningTask(ctx("reviewer", "mrp", null), "MRP", run).body();
        evidence("MRP_WITHOUT_ANY_MATERIAL_FACT", mrp.path("result"));
        try {
            fulfillment.createPurchaseRequest(ctx("maker", "pr", null), json("""
                {"mrpTaskId":"%s","demandId":"%s","materialId":"RM201"}
                """.formatted(mrp.path("taskId").asText(), demandId)));
            throw new AssertionError("Expected actual MRP result to block procurement");
        } catch (ApiException error) {
            evidence("PR_FROM_ACTUAL_MRP", java.util.Map.of("status", error.status(), "message", error.getMessage()));
        }
        JsonNode aps = production.startPlanningTask(ctx("reviewer", "aps", null), "APS", run).body();
        evidence("APS_WITHOUT_ANY_MATERIAL_FACT", aps.path("result"));
        ObjectNode workOrder = (ObjectNode) json("""
            {"productId":"FG001","factoryResourceId":"FAC-SH-01","workCenterResourceId":"WC-SH-01",
             "plannedQty":"10","inputQty":"10","uom":"PCS","dueDate":"2026-11-30",
             "bomSnapshotId":"not-a-real-bom","routingSnapshotId":"not-a-real-routing",
             "scheduleCandidateId":"not-a-real-candidate","kittingStatus":"READY"}
            """);
        workOrder.putArray("demandLinks").addObject().put("demandId", demandId).put("allocatedQty", "10");
        JsonNode wo = production.createWorkOrder(ctx("maker", "wo", null), workOrder).body();
        evidence("WORK_ORDER_WITH_INVALID_MASTER_REFERENCES", wo);
        evidence("RELEASE_IMPACT", production.releaseImpact(ctx("maker", null, null), wo.path("id").asText()));
        JsonNode released = production.releaseWorkOrder(ctx("maker", "release", 1),
                wo.path("id").asText(), json("{}")).body();
        evidence("DIRECT_RELEASE_DESPITE_FAILED_IMPACT", released.path("status"));

        ObjectNode sourceDemand = demandInput.deepCopy();
        sourceDemand.put("code", "DM-AUDIT-WAREHOUSE").put("sourceType", "SALES_ORDER_SHORTAGE")
                .put("sourceId", "source-sales").put("sourceLineId", "source-line");
        sourceDemand.putObject("payloadSnapshot").put("warehouseId", "WH-SELECTED");
        JsonNode warehouseDemand = production.createDemand(ctx("maker", "wd-create", null), sourceDemand).body();
        String warehouseDemandId = warehouseDemand.path("id").asText();
        production.validateDemand(ctx("maker", "wd-validate", 1), warehouseDemandId, json("{}"));
        production.approveDemand(ctx("reviewer", "wd-approve", 2), warehouseDemandId, json("{}"));
        production.claimDemand(ctx("reviewer", "wd-claim", 3), warehouseDemandId);
        ObjectNode warehouseRun = M.createObjectNode();
        warehouseRun.putArray("demandIds").add(warehouseDemandId);
        production.startPlanningTask(ctx("reviewer", "wd-mrp", null), "MRP", warehouseRun);
        ObjectNode warehouseWo = workOrder.deepCopy();
        warehouseWo.putArray("demandLinks").addObject().put("demandId", warehouseDemandId).put("allocatedQty", "10");
        JsonNode createdWarehouseWo = production.createWorkOrder(ctx("maker", "wd-wo", null), warehouseWo).body();
        evidence("SOURCE_WAREHOUSE", sourceDemand.path("payloadSnapshot"));
        evidence("WORK_ORDER_SAVED_PARAMETER_SNAPSHOT", createdWarehouseWo.path("parameterSnapshot"));
        JsonNode secondReleased = production.releaseWorkOrder(ctx("maker", "wd-release", 1),
                createdWarehouseWo.path("id").asText(), json("{}")).body();
        complete(production, ps, released, "completion1");
        complete(production, ps, secondReleased, "completion2");
        List<JsonNode> actualEvents = ps.pendingOutbox(TENANT, "production.completion.posted.v1");
        evidence("ACTUAL_COMPLETION_EVENTS", actualEvents);
        ProductionFulfillmentOutboxWorker worker = new ProductionFulfillmentOutboxWorker(ps, fulfillment, "", true, 8);
        evidence("TWO_COMPLETIONS_WORKER_DRAIN", worker.drain(TENANT));
        JsonNode inventory = fs.availability(TENANT, "WH-AUDIT", "FG001").orElseThrow();
        evidence("TWO_COMPLETIONS_TOTAL_INVENTORY", inventory);
        evidence("TWO_COMPLETIONS_INVENTORY_TRANSACTION_COUNT", fs.transactions(TENANT).size());
        if (!"10".equals(inventory.path("qualifiedOnHandQty").asText()))
            throw new AssertionError("Expected the second completion to be silently deduplicated");
        if (!"RELEASED".equals(released.path("status").asText())) throw new AssertionError("Release result changed");
        multipleShortageLines();
    }
}
