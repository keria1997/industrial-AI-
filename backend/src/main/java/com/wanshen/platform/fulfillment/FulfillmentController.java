package com.wanshen.platform.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import com.wanshen.platform.web.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Set;
import java.util.Map;
import java.util.List;

@RestController
@ConditionalOnProperty(value = "app.fulfillment.native-enabled", havingValue = "true")
public class FulfillmentController {
    private final FulfillmentService service;
    private final RequestContextService contexts;
    private final ObjectMapper mapper;
    
    public FulfillmentController(
            FulfillmentService service, RequestContextService contexts, ObjectMapper mapper
    ) {
        this.service = service;
        this.contexts = contexts;
        this.mapper = mapper;
    }

    @PostMapping("/api/v1/sales/sales-orders")
    public ResponseEntity<JsonNode> createOrder(@RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        FulfillmentService.Command result = service.createOrder(context, body);
        return command(result);
    }

    @GetMapping("/api/v1/sales/sales-orders")
    public Map<String, Object> listOrders(
            HttpServletRequest request,
            @RequestParam(required = false) String overallStatus,
            @RequestParam(required = false) String reviewStatus,
            @RequestParam(required = false) String shipmentStatus,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize
    ) {
        validatePage(page, pageSize);
        return service.listOrders(contexts.from(request), overallStatus, reviewStatus, shipmentStatus,
                search, page, pageSize);
    }

    @GetMapping("/api/v1/sales/sales-orders/{id}")
    public ResponseEntity<JsonNode> getOrder(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.order(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PatchMapping("/api/v1/sales/sales-orders/{id}")
    public ResponseEntity<JsonNode> updateOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.updateOrder(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/sales/sales-orders/{id}/review-submit")
    public ResponseEntity<JsonNode> resubmitReview(
            @PathVariable String id, @RequestBody(required = false) JsonNode body, HttpServletRequest request
    ) {
        return command(service.resubmitReview(contexts.from(request), id, empty(body)));
    }

    @PostMapping("/api/v1/sales/sales-orders/{id}/review-decisions")
    public ResponseEntity<JsonNode> decideReview(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.decideReview(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/sales/sales-orders/{id}/confirm")
    public ResponseEntity<JsonNode> confirmOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.confirmOrder(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/sales/sales-orders/{id}/shipment-requests")
    public ResponseEntity<JsonNode> createShipmentRequest(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.createShipmentRequest(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/sales/sales-orders/{id}/fulfillment-trace")
    public Map<String, Object> fulfillmentTrace(@PathVariable String id, HttpServletRequest request) {
        return service.fulfillmentTrace(contexts.from(request), id);
    }

    @PostMapping("/api/v1/sales/sales-orders/{id}/cancel")
    public ResponseEntity<JsonNode> cancelOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.cancelOrder(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/inventory/availability")
    public List<JsonNode> availability(
            HttpServletRequest request, @RequestParam(required = false) String warehouseId,
            @RequestParam(required = false) List<String> productIds
    ) {
        if (warehouseId != null && (warehouseId.isBlank() || warehouseId.length() > 100)
                || productIds != null && (productIds.isEmpty() || productIds.size() > 100
                || productIds.stream().anyMatch(id -> id.isBlank() || id.length() > 100))) {
            throw new ApiException(400, "FULFILLMENT_400_INVALID_ARGUMENT",
                    "库存查询条件无效", "仓库 ID 和产品 ID 最长 100 字，产品筛选最多 100 项");
        }
        return service.availability(contexts.from(request), warehouseId, productIds);
    }

    @PostMapping("/api/v1/inventory/internal/availability-events")
    public Object receiveAvailability(@RequestBody JsonNode body, HttpServletRequest request) {
        return service.receiveAvailability(contexts.from(request), body);
    }

    @PostMapping("/api/v1/inventory/import/availability")
    public Object importAvailability(@RequestBody JsonNode body, HttpServletRequest request) {
        return service.receiveAvailability(contexts.from(request), body);
    }

    @GetMapping("/api/v1/inventory/shipment-tasks")
    public Map<String, Object> shipmentTasks(
            HttpServletRequest request, @RequestParam(required = false) String warehouseId,
            @RequestParam(required = false) String workflowStatus,
            @RequestParam(required = false) String salesOrderId,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int pageSize
    ) {
        validatePage(page, pageSize);
        return service.shipmentTasks(contexts.from(request), warehouseId, workflowStatus, salesOrderId,
                page, pageSize);
    }

    @GetMapping("/api/v1/inventory/shipment-tasks/{id}")
    public ResponseEntity<JsonNode> shipmentTask(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.shipmentTask(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/shipment-tasks/{id}/check-and-reserve")
    public ResponseEntity<JsonNode> checkAndReserve(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.checkAndReserve(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/inventory/shipment-tasks/{id}/production-requests")
    public ResponseEntity<JsonNode> createProductionRequest(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        if (body.path("lines").isEmpty() || body.path("lines").size() > 200) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "lines 必须包含 1 到 200 行",
                    "为每个生产缺口提供生产申请参数");
        }
        for (JsonNode line : body.withArray("lines")) {
            if (line.path("shipmentRequestLineId").asText("").isBlank()
                    || line.path("orderLineId").asText("").isBlank()) {
                throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "缺口行缺少生产申请参数",
                        "提供 shipmentRequestLineId 和 orderLineId");
            }
        }
        return command(service.createProductionRequest(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/inventory/reservations/{id}")
    public ResponseEntity<JsonNode> reservation(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.reservation(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/reservations/{id}/release")
    public ResponseEntity<JsonNode> releaseReservation(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.releaseReservation(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/inventory/outbounds/{id}")
    public ResponseEntity<JsonNode> outbound(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.outbound(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/internal/completion-results")
    public Map<String, Object> completionResult(@RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        if (!body.path("tenantId").asText("").equals(context.tenantId())) {
            throw new ApiException(403, "FULFILLMENT_403_PERMISSION_DENIED", "事件租户与访问租户不一致",
                    "使用事件所属租户的服务身份重试");
        }
        if (!"production.completion.posted.v1".equals(body.path("eventType").asText())
                || !"Completion".equals(body.path("aggregateType").asText())
                || !body.path("aggregateId").asText("").equals(body.path("payload").path("completionId").asText())) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "完工事件信封或聚合 ID 不一致",
                    "保持 aggregateId=payload.completionId");
        }
        ObjectNode payload = body.withObject("payload");
        payload.put("eventId", body.path("eventId").asText())
                .put("occurredAt", body.path("occurredAt").asText());
        if (body.hasNonNull("correlationId")) payload.put("correlationId", body.path("correlationId").asText());
        FulfillmentService.CompletionProjection result = service.receiveCompletion(context, payload);
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("duplicate", result.duplicate());
        response.put("projectionResult", result.projectionResult());
        if (result.availability() != null) response.put("availability", result.availability());
        return response;
    }

    @PostMapping("/api/v1/inventory/outbounds/{id}/post")
    public ResponseEntity<JsonNode> postOutbound(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.postOutbound(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/inventory/transactions")
    public Map<String, Object> transactions(
            HttpServletRequest request, @RequestParam(required = false) String warehouseId,
            @RequestParam(required = false) String productId,
            @RequestParam(required = false) String sourceId,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int pageSize
    ) {
        validatePage(page, pageSize);
        return service.transactions(contexts.from(request), warehouseId, productId, sourceId, type, page, pageSize);
    }

    @GetMapping("/api/v1/inventory/reservations/query/{idempotencyKey}")
    public Object queryReservation(@PathVariable String idempotencyKey, HttpServletRequest request) {
        return service.queryWmsResult(contexts.from(request), "reserve", idempotencyKey);
    }

    @GetMapping("/api/v1/inventory/outbounds/query/{idempotencyKey}")
    public Object queryOutbound(@PathVariable String idempotencyKey, HttpServletRequest request) {
        return service.queryWmsResult(contexts.from(request), "out", idempotencyKey);
    }

    @GetMapping("/api/v1/inventory/releases/query/{idempotencyKey}")
    public Object queryRelease(@PathVariable String idempotencyKey, HttpServletRequest request) {
        return service.queryWmsResult(contexts.from(request), "rel", idempotencyKey);
    }

    @PostMapping("/api/v1/procurement/purchase-requests")
    public ResponseEntity<JsonNode> createPurchaseRequest(
            @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.createPurchaseRequest(contexts.from(request), body));
    }

    @GetMapping("/api/v1/procurement/purchase-requests")
    public Map<String, Object> purchaseRequests(HttpServletRequest request) {
        return service.purchaseRequests(contexts.from(request));
    }

    @PostMapping("/api/v1/procurement/purchase-requests/{id}/approve")
    public ResponseEntity<JsonNode> approvePurchaseRequest(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.approvePurchaseRequest(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/procurement/purchase-orders")
    public Map<String, Object> purchaseOrders(HttpServletRequest request) {
        return service.purchaseOrders(contexts.from(request));
    }

    @PostMapping("/api/v1/procurement/purchase-orders/{id}/receipts")
    public ResponseEntity<JsonNode> receivePurchaseOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.receivePurchaseOrder(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/procurement/purchase-receipts")
    public Map<String, Object> purchaseReceipts(HttpServletRequest request) {
        return service.purchaseReceipts(contexts.from(request));
    }

    @PostMapping("/api/v1/procurement/suppliers")
    public ResponseEntity<JsonNode> createSupplier(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createSupplier(contexts.from(request), body));
    }

    @GetMapping("/api/v1/procurement/suppliers")
    public Map<String, Object> suppliers(HttpServletRequest request) {
        return service.suppliers(contexts.from(request));
    }

    @GetMapping("/api/v1/procurement/suppliers/{id}")
    public JsonNode supplier(@PathVariable String id, HttpServletRequest request) {
        return service.supplier(contexts.from(request), id);
    }

    @PatchMapping("/api/v1/procurement/suppliers/{id}")
    public ResponseEntity<JsonNode> updateSupplier(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.updateSupplier(contexts.from(request), id, body));
    }

    @DeleteMapping("/api/v1/procurement/suppliers/{id}")
    public ResponseEntity<JsonNode> deleteSupplier(@PathVariable String id, HttpServletRequest request) {
        return command(service.deleteSupplier(contexts.from(request), id));
    }

    @PostMapping("/api/v1/procurement/purchase-requests/{id}/reject")
    public ResponseEntity<JsonNode> rejectPurchaseRequest(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.rejectPurchaseRequest(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/procurement/purchase-orders/{id}/cancel")
    public ResponseEntity<JsonNode> cancelPurchaseOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.cancelPurchaseOrder(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/procurement/purchase-receipts/{id}/inspect")
    public ResponseEntity<JsonNode> inspectReceipt(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.inspectReceipt(contexts.from(request), id, body));
    }

    @PostMapping("/api/v1/procurement/purchase-returns")
    public ResponseEntity<JsonNode> createPurchaseReturn(
            @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.createPurchaseReturn(contexts.from(request), body));
    }

    @PostMapping("/api/v1/procurement/purchase-returns/{id}/process")
    public ResponseEntity<JsonNode> processPurchaseReturn(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.processPurchaseReturn(contexts.from(request), id, body));
    }

    @GetMapping("/api/v1/procurement/purchase-returns")
    public Map<String, Object> purchaseReturns(HttpServletRequest request) {
        return service.purchaseReturns(contexts.from(request));
    }

    @GetMapping("/api/v1/inventory/warehouses")
    public Map<String, Object> warehouses(HttpServletRequest request) {
        return service.masterList(contexts.from(request), service.repository().warehouses,
                "inventory.warehouse.read");
    }

    @GetMapping("/api/v1/inventory/warehouses/{id}")
    public ResponseEntity<JsonNode> warehouse(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.masterGet(contexts.from(request), id, service.repository().warehouses,
                "inventory.warehouse.read", "仓库");
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/warehouses")
    public ResponseEntity<JsonNode> createWarehouse(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createMaster(contexts.from(request), body, service.repository().warehouses,
                "inventory.warehouse.create", "inventory.warehouse.create", "Warehouse"));
    }

    @PatchMapping("/api/v1/inventory/warehouses/{id}")
    public ResponseEntity<JsonNode> updateWarehouse(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.updateMaster(contexts.from(request), id, body, service.repository().warehouses,
                "inventory.warehouse.update", "inventory.warehouse.update", "Warehouse",
                Set.of("name", "type", "address", "manager", "phone", "status", "remark",
                        "organization", "capacity", "usedCapacity")));
    }

    @DeleteMapping("/api/v1/inventory/warehouses/{id}")
    public ResponseEntity<JsonNode> deleteWarehouse(@PathVariable String id, HttpServletRequest request) {
        return command(service.deleteMaster(contexts.from(request), id, service.repository().warehouses,
                "inventory.warehouse.delete", "Warehouse"));
    }

    @GetMapping("/api/v1/inventory/products")
    public Map<String, Object> products(HttpServletRequest request) {
        return service.masterList(contexts.from(request), service.repository().products,
                "inventory.product.read");
    }

    @GetMapping("/api/v1/inventory/products/{id}")
    public ResponseEntity<JsonNode> product(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.masterGet(contexts.from(request), id, service.repository().products,
                "inventory.product.read", "产品");
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/products")
    public ResponseEntity<JsonNode> createProduct(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createMaster(contexts.from(request), body, service.repository().products,
                "inventory.product.create", "inventory.product.create", "Product"));
    }

    @PatchMapping("/api/v1/inventory/products/{id}")
    public ResponseEntity<JsonNode> updateProduct(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.updateMaster(contexts.from(request), id, body, service.repository().products,
                "inventory.product.update", "inventory.product.update", "Product",
                Set.of("name", "specification", "category", "uom", "unitPrice", "safetyStockQty", "maxStockQty",
                        "productType", "status", "remark", "defaultWarehouseId")));
    }

    @GetMapping("/api/v1/inventory/materials")
    public Map<String, Object> materials(HttpServletRequest request) {
        return service.masterList(contexts.from(request), service.repository().materials,
                "inventory.material.read");
    }

    @GetMapping("/api/v1/inventory/materials/{id}")
    public ResponseEntity<JsonNode> material(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.masterGet(contexts.from(request), id, service.repository().materials,
                "inventory.material.read", "物料");
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/materials")
    public ResponseEntity<JsonNode> createMaterial(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createMaster(contexts.from(request), body, service.repository().materials,
                "inventory.material.create", "inventory.material.create", "Material"));
    }

    @PatchMapping("/api/v1/inventory/materials/{id}")
    public ResponseEntity<JsonNode> updateMaterial(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.updateMaster(contexts.from(request), id, body, service.repository().materials,
                "inventory.material.update", "inventory.material.update", "Material",
                Set.of("name", "specification", "category", "uom", "unitPrice", "safetyStockQty", "maxStockQty",
                        "materialType", "status", "remark", "defaultWarehouseId")));
    }

    @GetMapping("/api/v1/inventory/transfer-orders")
    public Map<String, Object> transferOrders(HttpServletRequest request) {
        return service.transferOrders(contexts.from(request));
    }

    @GetMapping("/api/v1/inventory/transfer-orders/{id}")
    public ResponseEntity<JsonNode> transferOrder(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.transferOrder(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/transfer-orders")
    public ResponseEntity<JsonNode> createTransferOrder(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createTransferOrder(contexts.from(request), body));
    }

    @PostMapping("/api/v1/inventory/transfer-orders/{id}/approve")
    public ResponseEntity<JsonNode> approveTransferOrder(
            @PathVariable String id, @RequestBody(required = false) JsonNode body, HttpServletRequest request
    ) {
        return command(service.transferAction(contexts.from(request), id, "APPROVE", empty(body)));
    }

    @PostMapping("/api/v1/inventory/transfer-orders/{id}/ship")
    public ResponseEntity<JsonNode> shipTransferOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.transferAction(contexts.from(request), id, "SHIP", body));
    }

    @PostMapping("/api/v1/inventory/transfer-orders/{id}/receive")
    public ResponseEntity<JsonNode> receiveTransferOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.transferAction(contexts.from(request), id, "RECEIVE", body));
    }

    @PostMapping("/api/v1/inventory/transfer-orders/{id}/cancel")
    public ResponseEntity<JsonNode> cancelTransferOrder(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.transferAction(contexts.from(request), id, "CANCEL", body));
    }

    @GetMapping("/api/v1/inventory/stocktake-tasks")
    public Map<String, Object> stocktakeTasks(HttpServletRequest request) {
        return service.stocktakeTasks(contexts.from(request));
    }

    @GetMapping("/api/v1/inventory/stocktake-tasks/{id}")
    public ResponseEntity<JsonNode> stocktakeTask(@PathVariable String id, HttpServletRequest request) {
        JsonNode value = service.stocktakeTask(contexts.from(request), id);
        return ResponseEntity.ok().eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/inventory/stocktake-tasks")
    public ResponseEntity<JsonNode> createStocktakeTask(@RequestBody JsonNode body, HttpServletRequest request) {
        return command(service.createStocktakeTask(contexts.from(request), body));
    }

    @PostMapping("/api/v1/inventory/stocktake-tasks/{id}/approve")
    public ResponseEntity<JsonNode> approveStocktakeTask(
            @PathVariable String id, @RequestBody(required = false) JsonNode body, HttpServletRequest request
    ) {
        return command(service.stocktakeAction(contexts.from(request), id, "APPROVE", empty(body)));
    }

    @PostMapping("/api/v1/inventory/stocktake-tasks/{id}/start")
    public ResponseEntity<JsonNode> startStocktakeTask(
            @PathVariable String id, @RequestBody(required = false) JsonNode body, HttpServletRequest request
    ) {
        return command(service.stocktakeAction(contexts.from(request), id, "START", empty(body)));
    }

    @PostMapping("/api/v1/inventory/stocktake-tasks/{id}/count")
    public ResponseEntity<JsonNode> countStocktakeTask(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.stocktakeAction(contexts.from(request), id, "COUNT", body));
    }

    @PostMapping("/api/v1/inventory/stocktake-tasks/{id}/adjust")
    public ResponseEntity<JsonNode> adjustStocktakeTask(
            @PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request
    ) {
        return command(service.stocktakeAction(contexts.from(request), id, "ADJUST", body));
    }

    private ResponseEntity<JsonNode> command(FulfillmentService.Command result) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.statusCode());
        if (result.replayed()) builder.header("X-Idempotent-Replay", "true");
        if (result.etagVersion() != null) builder.eTag("\"" + result.etagVersion() + "\"");
        return builder.body(result.body());
    }

    private JsonNode empty(JsonNode value) { return value == null ? mapper.createObjectNode() : value; }

    private void validatePage(int page, int pageSize) {
        if (page < 1 || pageSize < 1 || pageSize > 200) {
            throw new IllegalArgumentException("page or pageSize is invalid");
        }
    }


}
