package com.wanshen.platform.production;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.function.Supplier;

@RestController
@ConditionalOnProperty(value = "app.production.native-enabled", havingValue = "true")
public class ProductionController {
    private final ProductionService service;
    private final RequestContextService contexts;
    private final ObjectMapper mapper;

    public ProductionController(ProductionService service, RequestContextService contexts, ObjectMapper mapper) {
        this.service = service;
        this.contexts = contexts;
        this.mapper = mapper;
    }

    @GetMapping("/api/v1/production/readiness")
    public ResponseEntity<?> readiness(HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.readiness(context));
    }

    @GetMapping("/api/v1/production/demands")
    public ResponseEntity<?> demands(HttpServletRequest request, @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String factoryResourceId,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(required = false) Integer page,
                                     @RequestParam(required = false) Integer pageSize) {
        RequestContext context = contexts.from(request);
        Query query = query(page, pageSize);
        return ok(context, service.listDemands(context, status, factoryResourceId, search, query.page(), query.pageSize()));
    }

    @PostMapping("/api/v1/production/demands")
    public ResponseEntity<?> createDemand(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.createDemand(context(request), object(body)));
    }

    @PostMapping("/api/v1/production/internal/inventory-availability-events")
    public ResponseEntity<?> availabilityEvent(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.receiveInventoryAvailability(context, object(body)));
    }

    @PostMapping("/api/v1/production/sales-order-intakes")
    public ResponseEntity<?> createSalesOrderIntake(@RequestBody(required = false) ObjectNode body,
                                                     HttpServletRequest request) {
        return command(request, () -> service.createSalesOrderIntake(context(request), object(body)));
    }

    @GetMapping("/api/v1/production/sales-order-intakes/{salesOrderId}")
    public ResponseEntity<?> salesOrderIntake(@PathVariable String salesOrderId,
                                               @RequestParam(defaultValue = "1") String sourceLineId,
                                               @RequestParam(defaultValue = "1") Integer sourceRevision,
                                               HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.salesOrderIntake(context, salesOrderId, sourceLineId, sourceRevision));
    }

    @PostMapping("/api/v1/production/demands/{id}/validate")
    public ResponseEntity<?> validateDemand(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                             HttpServletRequest request) {
        return command(request, () -> service.validateDemand(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/demands/{id}/approve")
    public ResponseEntity<?> approveDemand(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                            HttpServletRequest request) {
        return command(request, () -> service.approveDemand(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/demands/{id}/claim")
    public ResponseEntity<?> claimDemand(@PathVariable String id, HttpServletRequest request) {
        return command(request, () -> service.claimDemand(context(request), id));
    }

    @GetMapping("/api/v1/production/work-orders")
    public ResponseEntity<?> workOrders(HttpServletRequest request, @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String factoryResourceId,
                                         @RequestParam(required = false) String search,
                                         @RequestParam(required = false) Integer page,
                                         @RequestParam(required = false) Integer pageSize) {
        RequestContext context = contexts.from(request);
        Query query = query(page, pageSize);
        return ok(context, service.listWorkOrders(context, status, factoryResourceId, search, query.page(), query.pageSize()));
    }

    @GetMapping("/api/v1/production/work-orders/{id}")
    public ResponseEntity<?> workOrder(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        JsonNode value = service.workOrder(context, id);
        return ResponseEntity.ok().header("X-Trace-Id", context.traceId())
                .eTag("\"" + value.path("version").asInt() + "\"").body(value);
    }

    @PostMapping("/api/v1/production/work-orders")
    public ResponseEntity<?> createWorkOrder(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.createWorkOrder(context(request), object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/release-impact")
    public ResponseEntity<?> releaseImpact(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.releaseImpact(context, id));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/release")
    public ResponseEntity<?> releaseWorkOrder(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                               HttpServletRequest request) {
        return command(request, () -> service.releaseWorkOrder(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/kitting-check")
    public ResponseEntity<?> checkKitting(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                          HttpServletRequest request) {
        return command(request, () -> service.checkKitting(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/bom-snapshots")
    public ResponseEntity<?> saveBom(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.saveBom(context(request), object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/start")
    public ResponseEntity<?> startWorkOrder(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                             HttpServletRequest request) {
        return command(request, () -> service.startWorkOrder(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/pause")
    public ResponseEntity<?> pauseWorkOrder(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                             HttpServletRequest request) {
        return command(request, () -> service.pauseWorkOrder(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/resume")
    public ResponseEntity<?> resumeWorkOrder(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                              HttpServletRequest request) {
        return command(request, () -> service.resumeWorkOrder(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/reports")
    public ResponseEntity<?> submitReport(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                           HttpServletRequest request) {
        return command(request, () -> service.submitReport(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-reports/{id}/corrections")
    public ResponseEntity<?> correctReport(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                            HttpServletRequest request) {
        return command(request, () -> service.correctReport(context(request), id, object(body)));
    }

    @GetMapping("/api/v1/production/inspections")
    public ResponseEntity<?> inspections(@RequestParam(required = false) String workOrderId, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.inspections(context, workOrderId));
    }

    @PostMapping("/api/v1/production/inspections")
    public ResponseEntity<?> createInspection(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.createInspection(context(request), object(body)));
    }

    @PostMapping("/api/v1/production/inspections/{id}/result")
    public ResponseEntity<?> inspectionResult(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                               HttpServletRequest request) {
        return command(request, () -> service.submitInspectionResult(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/inspections/{id}/rework")
    public ResponseEntity<?> reworkInspection(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                               HttpServletRequest request) {
        return command(request, () -> service.createRework(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/inspections/{id}/scrap")
    public ResponseEntity<?> scrapInspection(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                              HttpServletRequest request) {
        return command(request, () -> service.scrapInspection(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/rework-orders/{id}/complete")
    public ResponseEntity<?> completeRework(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                            HttpServletRequest request) {
        return command(request, () -> service.completeRework(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/completion-allocation-preview")
    public ResponseEntity<?> allocationPreview(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                                HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.allocationPreview(context, id, object(body).path("qty").asText()));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/completions")
    public ResponseEntity<?> createCompletion(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                               HttpServletRequest request) {
        return command(request, () -> service.createCompletion(context(request), id, object(body)));
    }

    @GetMapping("/api/v1/production/completions/{id}")
    public ResponseEntity<?> completion(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.completion(context, id));
    }

    @GetMapping("/api/v1/production/completions")
    public ResponseEntity<?> completions(@RequestParam(required = false) String workOrderId, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.completions(context, workOrderId));
    }

    @GetMapping("/api/v1/production/work-order-closes")
    public ResponseEntity<?> closes(HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.closes(context));
    }

    @PostMapping("/api/v1/production/completions/{id}/retry")
    public ResponseEntity<?> retryCompletion(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                              HttpServletRequest request) {
        return command(request, () -> service.retryCompletion(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/internal/completions/{id}/inventory-result")
    public ResponseEntity<?> inventoryResult(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                              HttpServletRequest request) {
        return command(request, () -> service.inventoryResult(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/close-check")
    public ResponseEntity<?> closeCheck(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.closeCheck(context, id));
    }

    @PostMapping("/api/v1/production/work-orders/{id}/close-submit")
    public ResponseEntity<?> closeSubmit(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                          HttpServletRequest request) {
        return command(request, () -> service.closeSubmit(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/work-order-closes/{id}/approve")
    public ResponseEntity<?> approveClose(@PathVariable String id, @RequestBody(required = false) ObjectNode body,
                                           HttpServletRequest request) {
        return command(request, () -> service.approveClose(context(request), id, object(body)));
    }

    @PostMapping("/api/v1/production/mrp-runs")
    public ResponseEntity<?> mrpRun(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.startPlanningTask(context(request), "MRP", object(body)));
    }

    @PostMapping("/api/v1/production/schedule-runs")
    public ResponseEntity<?> scheduleRun(@RequestBody(required = false) ObjectNode body, HttpServletRequest request) {
        return command(request, () -> service.startPlanningTask(context(request), "APS", object(body)));
    }

    @GetMapping("/api/v1/production/tasks/{id}")
    public ResponseEntity<?> task(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.task(context, id));
    }

    @GetMapping("/api/v1/production/dashboard/kpis")
    public ResponseEntity<?> dashboard(HttpServletRequest request) {
        RequestContext context = contexts.from(request);
        return ok(context, service.dashboard(context));
    }

    private ResponseEntity<?> command(HttpServletRequest request, Supplier<ProductionService.Command> action) {
        ProductionService.Command result = action.get();
        RequestContext context = contexts.from(request);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(result.statusCode())
                .header("X-Trace-Id", context.traceId());
        if (result.replayed()) response.header("X-Idempotent-Replay", "true");
        Integer version = aggregateVersion(result.body());
        if (version != null) response.eTag("\"" + version + "\"");
        return response.body(result.body());
    }

    private ResponseEntity<?> ok(RequestContext context, Object body) {
        return ResponseEntity.ok().header("X-Trace-Id", context.traceId()).body(body);
    }

    private Integer aggregateVersion(JsonNode body) {
        for (String path : List.of("/version", "/workOrder/version", "/completion/version", "/closeRequest/version")) {
            JsonNode value = body.at(path);
            if (value.canConvertToInt()) return value.asInt();
        }
        return null;
    }

    private Query query(Integer page, Integer pageSize) {
        int safePage = page == null ? 1 : page;
        int safeSize = pageSize == null ? 20 : pageSize;
        if (safePage < 1 || safeSize < 1 || safeSize > 200) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "分页参数不合法", "页码和每页数量必须有效");
        }
        return new Query(safePage, safeSize);
    }

    private ObjectNode object(ObjectNode value) { return value == null ? mapper.createObjectNode() : value; }
    private RequestContext context(HttpServletRequest request) { return contexts.from(request); }

    private record Query(int page, int pageSize) {}
}
