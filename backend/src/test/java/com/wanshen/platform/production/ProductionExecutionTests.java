package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.fulfillment.FulfillmentService;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.fulfillment.ProductionInventoryAdapter;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ProductionExecutionTests {
    static final ObjectMapper MAPPER = new ObjectMapper();

    static RequestContext context(String tenant, String actor, String key, Integer version) {
        return new RequestContext(tenant, actor, List.of("*"), "trace-" + key, key, version);
    }
    static ObjectNode json(String value) {
        try { return (ObjectNode) MAPPER.readTree(value); } catch (Exception error) { throw new IllegalArgumentException(error); }
    }
    static ObjectNode fact(String tenant, String qty, int version) {
        return json("""
                {"warehouseId":"RM-WH","productId":"RM1","uom":"PCS","qualifiedOnHandQty":"0",
                 "allocatedReservedQty":"0","frozenQty":"0","safetyStockQty":"0","inTransitQty":"0","fulfillableQty":"0"}
                """).put("tenantId", tenant).put("qualifiedOnHandQty", qty).put("fulfillableQty", qty).put("factVersion", version);
    }
    static ProductionService service(ProductionStore production, FulfillmentStore inventory) {
        var service = new ProductionService(production, MAPPER);
        service.setInventoryPort(new ProductionInventoryAdapter(inventory, MAPPER));
        return service;
    }

    static String runChain(ProductionStore store, FulfillmentStore inventory, String tenant) {
        return runChain(store, inventory, tenant, null);
    }

    static String runChain(ProductionStore store, FulfillmentStore inventory, String tenant, JsonNode sourceDemand) {
        var service = service(store, inventory);
        var writer = context(tenant, "writer", "bom", null);
        service.saveBom(writer, json("""
                {"productId":"FG1","routingSnapshotId":"route-1",
                  "routingSnapshot":{"id":"route-1","productId":"FG1","operations":[
                    {"sequence":10,"code":"ASSEMBLY","name":"Assembly","workCenterResourceId":"WC1","standardMinutes":"2"}]},
                  "lines":[{"materialId":"RM1","qtyPer":"2","warehouseId":"RM-WH","uom":"PCS"}]}
                """));
        JsonNode demand = sourceDemand != null ? sourceDemand : service.createDemand(context(tenant, "writer", "demand", null), json("""
                {"productId":"FG1","sourceType":"MANUAL","qty":"10","uom":"PCS","dueDate":"2026-11-30",
                  "factoryResourceId":"FAC1","inventoryWarehouseId":"FG-WH"}
                """)).body();
        String demandId = demand.path("id").asText();
        service.validateDemand(context(tenant, "writer", "validate", 1), demandId, json("{}"));
        service.approveDemand(context(tenant, "writer", "self", 2), demandId, json("{}"));
        assertThat(store.demand(tenant, demandId).orElseThrow().path("approvedBy").asText()).isEqualTo("writer");
        service.claimDemand(context(tenant, "reviewer", "claim", 3), demandId);
        ObjectNode planning = json("{}"); planning.putArray("demandIds").add(demandId);
        JsonNode mrp = service.startPlanningTask(context(tenant, "reviewer", "mrp", null), "MRP", planning).body();
        assertThat(mrp.path("result").path("canProceedToAps").asBoolean()).isFalse();
        assertThat(mrp.path("result").path("materialShortages").get(0).path("shortageQty").asText()).isEqualTo("20");
        assertThatThrownBy(() -> service.startPlanningTask(context(tenant, "reviewer", "aps-short", null), "APS", planning))
                .isInstanceOf(ApiException.class);
        inventory.saveAvailability(fact(tenant, "40", 1));
        JsonNode aps = service.startPlanningTask(context(tenant, "reviewer", "aps", null), "APS", planning).body();
        String candidate = aps.path("result").path("scheduleCandidates").get(0).path("id").asText();
        ObjectNode create = json("""
                {"productId":"FG1","factoryResourceId":"FAC1","workCenterResourceId":"WC1","plannedQty":"10",
                  "inputQty":"10","uom":"PCS","dueDate":"2026-11-30","kittingStatus":"READY"}
                """).put("scheduleCandidateId", candidate);
        create.putArray("demandLinks").addObject().put("demandId", demandId).put("allocatedQty", "10");
        JsonNode order = service.createWorkOrder(context(tenant, "reviewer", "order", null), create).body();
        String id = order.path("id").asText();
        assertThat(order.path("parameterSnapshot").path("inventoryWarehouseId").asText()).isEqualTo("FG-WH");
        assertThat(service.releaseImpact(writer, id).get("canRelease")).isEqualTo(false);
        assertThatThrownBy(() -> service.releaseWorkOrder(context(tenant, "reviewer", "unsafe-release", 1), id, json("{}")))
                .isInstanceOf(ApiException.class);
        var releaseOnly = new RequestContext(tenant, "reviewer", List.of("production.work-order.release"), "trace-kit", "kit", 1);
        assertThatThrownBy(() -> service.workOrder(releaseOnly, id)).isInstanceOf(ApiException.class);
        order = service.checkKitting(releaseOnly, id, json("{}")).body();
        assertThat(service.checkKitting(context(tenant, "reviewer", "kit", 1), id, json("{}")).replayed()).isTrue();
        assertThat(inventory.availability(tenant, "RM-WH", "RM1").orElseThrow().path("allocatedReservedQty").asText()).isEqualTo("20");
        order = service.releaseWorkOrder(context(tenant, "reviewer", "release", order.path("version").asInt()), id, json("{}")).body();
        var startOnly = new RequestContext(tenant, "reviewer", List.of("production.work-order.start"),
                "trace-start", "start", order.path("version").asInt());
        order = service.startWorkOrder(startOnly, id, json("{}")).body();
        assertThat(order.path("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(inventory.transactions(tenant)).hasSize(1);
        assertThat(service.startWorkOrder(context(tenant, "reviewer", "start", 3), id, json("{}")).replayed()).isTrue();
        int reportVersion = order.path("version").asInt();
        JsonNode report = service.submitReport(context(tenant, "reviewer", "report", reportVersion), id,
                json("{\"goodQty\":\"10\",\"defectQty\":\"0\",\"scrapQty\":\"0\",\"inputQty\":\"0\",\"uom\":\"PCS\"}")).body();
        assertThatThrownBy(() -> service.submitReport(context(tenant, "reviewer", "over-report", report.path("workOrder").path("version").asInt()), id,
                json("{\"goodQty\":\"1\",\"uom\":\"PCS\"}"))).isInstanceOf(ApiException.class);
        ObjectNode inspect = json("{}").put("workOrderId", id).put("sampleQty", "10");
        JsonNode inspection = service.createInspection(context(tenant, "reviewer", "inspection", null), inspect).body();
        String inspectionId = inspection.path("id").asText();
        inspection = service.submitInspectionResult(context(tenant, "inspector", "result", 1), inspectionId,
                json("{\"passedQty\":\"10\",\"failedQty\":\"0\"}")).body();
        ObjectNode completion = json("""
                {"qty":"4","uom":"PCS","warehouseResourceId":"FG-WH","inventoryWarehouseId":"FG-WH",
                  "productionDate":"2026-10-13","traceMode":"NONE","allocationRevision":1}
                """).put("inspectionId", inspectionId);
        String first = service.createCompletion(context(tenant, "reviewer", "completion1", null), id, completion).body().path("completionId").asText();
        assertThat(service.completion(writer, first).path("status").asText()).isEqualTo("POSTING");
        var fulfillment = new FulfillmentService(inventory, MAPPER, "TEST", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        var worker = new ProductionFulfillmentOutboxWorker(store, fulfillment, service, tenant, true, 8);
        assertThat(worker.drain(tenant).failed()).isZero();
        completion.put("qty", "6").put("allocationRevision", 2);
        String second = service.createCompletion(context(tenant, "reviewer", "completion2", null), id, completion).body().path("completionId").asText();
        assertThat(worker.drain(tenant).failed()).isZero();
        worker.drain(tenant);
        assertThat(service.completion(writer, first).path("status").asText()).isEqualTo("POSTED");
        assertThat(service.completion(writer, second).path("status").asText()).isEqualTo("POSTED");
        assertThat(inventory.availability(tenant, "FG-WH", "FG1").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("10");
        assertThat(inventory.transactions(tenant)).hasSize(3);
        assertThatThrownBy(() -> service.createCompletion(context(tenant, "reviewer", "over-completion", null), id, completion))
                .isInstanceOf(ApiException.class);
        JsonNode current = service.workOrder(writer, id);
        assertThat(current.path("status").asText()).isEqualTo("COMPLETED");
        JsonNode close = service.closeSubmit(context(tenant, "reviewer", "close", current.path("version").asInt()), id, json("{}")).body();
        assertThatThrownBy(() -> service.approveClose(context(tenant, "reviewer", "self-close", 1), close.path("id").asText(), json("{}")))
                .isInstanceOf(ApiException.class);
        service.approveClose(context(tenant, "director", "approve-close", 1), close.path("id").asText(), json("{}"));
        assertThat(service.workOrder(writer, id).path("status").asText()).isEqualTo("CLOSED");
        return id;
    }

    @Test void realStockReservationExecutionAndTwoReceipts() {
        runChain(new ProductionStore(), new FulfillmentStore(), "T-EXEC");
    }

    @Test void rejectsNegativeReportAndRecordsFailedQualityWithoutPassing() {
        var store = new ProductionStore();
        var service = service(store, new FulfillmentStore());
        store.saveWorkOrder(json("""
                {"tenantId":"T","id":"WO1","status":"IN_PROGRESS","plannedQty":"10","inputQty":"10",
                "reportedGoodQty":"10","reportedDefectQty":"0","reportedScrapQty":"0","version":1}
                """));
        assertThatThrownBy(() -> service.submitReport(context("T", "operator", "negative", 1), "WO1", json("{\"goodQty\":\"-1\"}")))
                .isInstanceOf(ApiException.class);
        JsonNode inspection = service.createInspection(context("T", "operator", "inspect", null),
                json("{\"workOrderId\":\"WO1\",\"sampleQty\":\"10\"}")).body();
        JsonNode result = service.submitInspectionResult(context("T", "inspector", "result", 1), inspection.path("id").asText(),
                json("{\"passedQty\":\"8\",\"failedQty\":\"2\"}")).body();
        assertThat(result.path("status").asText()).isEqualTo("DISPOSITION_PENDING");
        assertThat(result.path("failedQty").asText()).isEqualTo("2");
        assertThat(service.inspections(context("OTHER", "operator", "list", null), null)).isEmpty();
    }

    @Test void failedQualityRequiresReworkAndRealReinspectionBeforeReceipt() {
        var store = new ProductionStore();
        var inventory = new FulfillmentStore();
        var service = service(store, inventory);
        seedQualityOrder(store);
        ObjectNode initial = (ObjectNode) store.workOrder("T", "WO1").orElseThrow();
        initial.put("reportedGoodQty", "8").put("reportedDefectQty", "2");
        store.saveWorkOrder(initial);
        JsonNode original = service.createInspection(context("T", "operator", "inspect", null),
                json("{\"workOrderId\":\"WO1\",\"sampleQty\":\"10\"}")).body();
        original = service.submitInspectionResult(context("T", "inspector", "result", 1), original.path("id").asText(),
                json("{\"passedQty\":\"8\",\"failedQty\":\"2\"}")).body();
        String originalId = original.path("id").asText();
        assertThatThrownBy(() -> service.createCompletion(context("T", "operator", "blocked", null), "WO1",
                receipt(originalId, "8"))).isInstanceOf(ApiException.class);
        JsonNode rework = service.createRework(context("T", "director", "rework", 2), original.path("id").asText(),
                json("{\"qty\":\"2\",\"reason\":\"修复\"}")).body().path("reworkOrder");
        JsonNode child = service.completeRework(context("T", "operator", "rework-complete", null),
                rework.path("id").asText(), json("{}")).body();
        assertThat(service.completeRework(context("T", "operator", "rework-complete", null),
                rework.path("id").asText(), json("{}")).replayed()).isTrue();
        service.submitInspectionResult(context("T", "inspector", "child-result", 1), child.path("id").asText(),
                json("{\"passedQty\":\"2\",\"failedQty\":\"0\"}"));
        assertThat(service.workOrder(context("T", "operator", "recovered", null), "WO1").path("qualityRecoveredQty").asText()).isEqualTo("2");
        assertThat(store.inspection("T", original.path("id").asText()).orElseThrow().path("status").asText()).isEqualTo("REWORKED");
        service.createCompletion(context("T", "operator", "receipt-original", null), "WO1", receipt(original.path("id").asText(), "8"));
        service.createCompletion(context("T", "operator", "receipt-child", null), "WO1",
                receipt(child.path("id").asText(), "2", 2));
        var fulfillment = new FulfillmentService(inventory, MAPPER, "TEST", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        assertThat(new ProductionFulfillmentOutboxWorker(store, fulfillment, service, "T", true, 8).drain("T").failed()).isZero();
        assertThat(service.workOrder(context("T", "operator", "read", null), "WO1").path("status").asText()).isEqualTo("COMPLETED");
        assertThat(service.closeCheck(context("T", "operator", "check", null), "WO1").get("canClose")).isEqualTo(true);
        assertThat(inventory.availability("T", "FG-WH", "FG1").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("10");
    }

    @Test void scrapRequiresDifferentActorAndSettlesOnlyFailedQuantity() {
        var store = new ProductionStore();
        var inventory = new FulfillmentStore();
        var service = service(store, inventory);
        seedQualityOrder(store);
        JsonNode inspection = service.createInspection(context("T", "operator", "inspect", null),
                json("{\"workOrderId\":\"WO1\",\"sampleQty\":\"10\"}")).body();
        String id = inspection.path("id").asText();
        service.submitInspectionResult(context("T", "inspector", "result", 1), id,
                json("{\"passedQty\":\"8\",\"failedQty\":\"2\"}"));
        assertThatThrownBy(() -> service.scrapInspection(context("T", "inspector", "self-scrap", 2), id, json("{\"qty\":\"2\"}")))
                .isInstanceOf(ApiException.class);
        service.scrapInspection(context("T", "director", "scrap", 2), id, json("{\"qty\":\"2\",\"reason\":\"无法修复\"}"));
        service.createCompletion(context("T", "operator", "receipt", null), "WO1", receipt(id, "8"));
        var fulfillment = new FulfillmentService(inventory, MAPPER, "TEST", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        assertThat(new ProductionFulfillmentOutboxWorker(store, fulfillment, service, "T", true, 8).drain("T").failed()).isZero();
        assertThat(service.workOrder(context("T", "operator", "read", null), "WO1").path("qualityScrapQty").asText()).isEqualTo("2");
        assertThat(service.closeCheck(context("T", "operator", "check", null), "WO1").get("canClose")).isEqualTo(true);
        assertThat(inventory.availability("T", "FG-WH", "FG1").orElseThrow().path("qualifiedOnHandQty").asText()).isEqualTo("8");
    }

    private static void seedQualityOrder(ProductionStore store) {
        store.saveWorkOrder(json("""
                {"tenantId":"T","id":"WO1","status":"IN_PROGRESS","productId":"FG1","plannedQty":"10","inputQty":"10",
                 "reportedGoodQty":"10","reportedDefectQty":"0","reportedScrapQty":"0","postedQty":"0","uom":"PCS","version":1,
                 "parameterSnapshot":{"inventoryWarehouseId":"FG-WH"}}
                """));
    }

    @Test void receiptRetryKeepsOriginalLedgerIdentity() {
        var store = new ProductionStore();
        var inventory = new FulfillmentStore();
        var service = service(store, inventory);
        seedQualityOrder(store);
        JsonNode inspection = service.createInspection(context("T", "operator", "inspect", null),
                json("{\"workOrderId\":\"WO1\",\"sampleQty\":\"10\"}")).body();
        String inspectionId = inspection.path("id").asText();
        service.submitInspectionResult(context("T", "inspector", "result", 1), inspectionId,
                json("{\"passedQty\":\"10\",\"failedQty\":\"0\"}"));
        String completion = service.createCompletion(context("T", "operator", "receipt", null), "WO1",
                receipt(inspectionId, "10")).body().path("completionId").asText();
        service.inventoryResult(context("T", "inventory", "reject", null), completion, json("{\"result\":\"REJECTED\"}"));
        assertThatThrownBy(() -> service.createCompletion(context("T", "operator", "duplicate", null), "WO1",
                receipt(inspectionId, "10"))).isInstanceOf(ApiException.class);
        service.retryCompletion(context("T", "operator", "retry", null), completion, json("{}"));
        var fulfillment = new FulfillmentService(inventory, MAPPER, "TEST", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
        var worker = new ProductionFulfillmentOutboxWorker(store, fulfillment, service, "T", true, 8);
        assertThat(worker.drain("T").failed()).isZero();
        worker.drain("T");
        assertThat(inventory.transactions("T")).hasSize(1);
        assertThat(service.completion(context("T", "operator", "read", null), completion).path("status").asText()).isEqualTo("POSTED");
    }

    @Test void correctionReplacesInputAndEnforcesBoundsAndPermissions() {
        var store = new ProductionStore();
        var service = service(store, new FulfillmentStore());
        seedQualityOrder(store);
        ObjectNode order = (ObjectNode) store.workOrder("T", "WO1").orElseThrow();
        order.put("inputQty", "0").put("reportedGoodQty", "0");
        store.saveWorkOrder(order);
        JsonNode report = service.submitReport(context("T", "operator", "report", 1), "WO1",
                json("{\"goodQty\":\"5\",\"inputQty\":\"10\",\"uom\":\"PCS\"}")).body().path("report");
        JsonNode correction = service.correctReport(context("T", "operator", "correct", 1), report.path("id").asText(),
                json("{\"goodQty\":\"4\",\"inputQty\":\"10\",\"reason\":\"更正录入\"}")).body();
        assertThat(correction.path("workOrder").path("inputQty").asText()).isEqualTo("10");
        assertThat(correction.path("workOrder").path("reportedGoodQty").asText()).isEqualTo("4");
        assertThatThrownBy(() -> service.correctReport(context("T", "operator", "overflow", 1),
                correction.path("replacementReport").path("id").asText(),
                json("{\"goodQty\":\"11\",\"inputQty\":\"10\",\"reason\":\"更正\"}"))).isInstanceOf(ApiException.class);
        var denied = new RequestContext("T", "reader", List.of("production.work-order.read"), "trace", "denied", 3);
        assertThatThrownBy(() -> service.checkKitting(denied, "WO1", json("{}"))).isInstanceOf(ApiException.class);
    }

    private static ObjectNode receipt(String inspectionId, String qty) {
        return receipt(inspectionId, qty, 1);
    }

    private static ObjectNode receipt(String inspectionId, String qty, int allocationRevision) {
        return json("""
                {"uom":"PCS","inventoryWarehouseId":"FG-WH","warehouseResourceId":"FG-WH",
                 "traceMode":"NONE","allocationRevision":%d,"productionDate":"2026-10-13"}
                """.formatted(allocationRevision)).put("inspectionId", inspectionId).put("qty", qty);
    }
}
