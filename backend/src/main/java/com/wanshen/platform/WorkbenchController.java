package com.wanshen.platform;

import com.wanshen.platform.ai.AbstractAiStore;
import com.wanshen.platform.finance.AbstractFinanceStore;
import com.wanshen.platform.finance.AbstractFinanceStore.FinanceFilter;
import com.wanshen.platform.fulfillment.FulfillmentStore;
import com.wanshen.platform.message.AbstractMessageStore;
import com.wanshen.platform.personnel.AbstractPersonnelStore;
import com.wanshen.platform.production.ProductionStore;
import com.wanshen.platform.supplychain.AbstractSupplyChainStore;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
public class WorkbenchController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> TENANT_ADMIN_ROLES = Set.of("老板", "管理员", "超级管理员");
    private static final Set<String> ROLES = Set.of("老板", "销售", "计划员", "采购", "仓管", "车间", "财务", "人事", "管理员", "超级管理员");
    private static final Set<String> PENDING_DEMANDS = Set.of("RECEIVED", "VALIDATING", "PENDING_REVIEW", "BLOCKED");
    private static final Set<String> CLOSED_PRODUCTION = Set.of("CLOSED", "CANCELLED");
    private static final Set<String> CLOSED_INSPECTION = Set.of("PASSED", "SCRAPPED");
    private static final Set<String> OPEN_FINANCE = Set.of("pending", "processing");
    private static final Set<String> OPEN_PURCHASE_ORDERS = Set.of("CONFIRMED", "PARTIALLY_RECEIVED");
    private static final Set<String> PENDING_RECEIPTS = Set.of("PENDING_INSPECTION", "INSPECTING");

    private final AbstractFinanceStore financeStore;
    private final AbstractPersonnelStore personnelStore;
    private final ProductionStore productionStore;
    private final FulfillmentStore fulfillmentStore;
    private final AbstractSupplyChainStore supplyChainStore;
    private final AbstractAiStore aiStore;
    private final AbstractMessageStore messageStore;
    private final RequestContextService contexts;
    private final ObjectMapper mapper;

    public WorkbenchController(
            AbstractFinanceStore financeStore,
            AbstractPersonnelStore personnelStore,
            ProductionStore productionStore,
            FulfillmentStore fulfillmentStore,
            AbstractSupplyChainStore supplyChainStore,
            AbstractAiStore aiStore,
            AbstractMessageStore messageStore,
            RequestContextService contexts,
            ObjectMapper mapper
    ) {
        this.financeStore = financeStore;
        this.personnelStore = personnelStore;
        this.productionStore = productionStore;
        this.fulfillmentStore = fulfillmentStore;
        this.supplyChainStore = supplyChainStore;
        this.aiStore = aiStore;
        this.messageStore = messageStore;
        this.contexts = contexts;
        this.mapper = mapper;
    }

    public record Metric(String key, String title, String value, String unit, String definition) {}
    public record Todo(String module, String sourceType, String sourceId, String sourceNo,
                       String title, String dueDate, boolean urgent) {}
    public record Alert(String module, String severity, String title, String detail,
                        String sourceId, String sourceNo) {}
    public record Activity(String id, String title, String detail, String module,
                           String sourceType, String sourceId, String sourceNo, String occurredAt) {}

    @GetMapping("/api/v1/workbench/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request, @RequestParam String role,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String sections,
            @RequestParam(defaultValue = "KEY") String eventScope,
            @RequestParam(defaultValue = "5") int todoLimit,
            @RequestParam(defaultValue = "10") int activityLimit,
            @RequestParam(required = false) String cursor) {
        RequestContext context = contexts.from(request);
        require(context, "workbench.dashboard.read");
        if (!ROLES.contains(role)) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_ROLE", "不支持的工作台角色：" + role,
                    "请从页面角色列表中选择有效岗位");
        }
        validateLimits(todoLimit, activityLimit);
        if (!Set.of("KEY", "ALL").contains(eventScope)) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_EVENT_SCOPE",
                    "eventScope只支持KEY或ALL", "使用默认KEY事件范围");
        }
        int activityOffset = decodeActivityCursor(cursor);
        String today = businessDate(date);
        String month = today.substring(0, 7);
        String horizon = LocalDate.parse(today).plusDays(7).toString();

        String tenantId = context.tenantId();
        var receivables = financeStore.receivables(tenantId, financeFilter()).items().stream().map(this::json).toList();
        var payables = financeStore.payables(tenantId, financeFilter()).items().stream().map(this::json).toList();
        var demands = productionStore.demands(tenantId, null, null, null, Integer.MAX_VALUE, 0);
        var workOrders = productionStore.workOrders(tenantId, null, null, null, Integer.MAX_VALUE, 0);
        var inspections = productionStore.inspections(tenantId, null);
        var salesOrders = fulfillmentStore.orders(tenantId);
        var shipmentTasks = fulfillmentStore.shipmentTasks(tenantId);
        var purchaseRequests = fulfillmentStore.purchaseRequests(tenantId);
        var purchaseOrders = fulfillmentStore.purchaseOrders(tenantId);
        var purchaseReceipts = fulfillmentStore.purchaseReceipts(tenantId);
        var stocktakes = fulfillmentStore.stocktakeTasks(tenantId);
        var employees = personnelStore.employees(tenantId, 1, Integer.MAX_VALUE, "active", null, null, null).items().stream().map(this::json).toList();
        var attendances = personnelStore.attendances(tenantId, 1, Integer.MAX_VALUE, null, null, null, today, null).items().stream().map(this::json).toList();
        var skills = personnelStore.skills(tenantId, 1, Integer.MAX_VALUE, null, null, null, null).items().stream().map(this::json).toList();
        var supplyRisks = supplyChainStore.riskEvents(tenantId, new AbstractSupplyChainStore.RiskFilter(1, Integer.MAX_VALUE, "active", null, null, null, null)).items();
        var aiInsights = aiStore.insights(tenantId, new AbstractAiStore.InsightFilter(1, Integer.MAX_VALUE, null, null, null, "active", null)).items();

        List<JsonSnapshot> pendingDemands = demands.stream()
                .filter(item -> PENDING_DEMANDS.contains(text(item, "status"))).map(JsonSnapshot::new).toList();
        List<JsonSnapshot> activeOrders = workOrders.stream()
                .filter(item -> !CLOSED_PRODUCTION.contains(text(item, "status"))).map(JsonSnapshot::new).toList();
        List<JsonSnapshot> overdueOrders = activeOrders.stream()
                .filter(item -> date(item.value, "dueDate").isBefore(LocalDate.parse(today))
                        && !"COMPLETED".equals(text(item.value, "status"))).toList();
        List<JsonSnapshot> openFqc = inspections.stream()
                .filter(item -> !CLOSED_INSPECTION.contains(text(item, "status"))).map(JsonSnapshot::new).toList();
        BigDecimal plannedQty = activeOrders.stream().map(item -> decimal(item.value, "plannedQty")).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal postedQty = activeOrders.stream().map(item -> decimal(item.value, "postedQty")).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal completionRate = percent(postedQty, plannedQty);
        long lowStockCount = fulfillmentStore.availability(tenantId).stream()
                .filter(item -> decimal(item, "safetyStockQty").signum() > 0
                        && decimal(item, "fulfillableQty").compareTo(decimal(item, "safetyStockQty")) < 0)
                .map(item -> text(item, "productId")).distinct().count();
        long attendedEmployees = attendances.stream()
                .filter(item -> !item.path("clockIn").isNull() && !Set.of("ABSENT", "LEAVE").contains(text(item, "status")))
                .map(item -> text(item, "employeeId")).distinct().count();
        BigDecimal attendanceRate = employees.isEmpty() ? BigDecimal.ZERO : percent(BigDecimal.valueOf(attendedEmployees), BigDecimal.valueOf(employees.size()));

        List<Metric> metrics = switch (role) {
            case "老板", "管理员", "超级管理员" -> List.of(
                    metric("monthlyReceivable", "本月新增应收", sum(receivables.stream()
                            .filter(item -> OPEN_FINANCE.contains(text(item, "status")) || "settled".equals(text(item, "status")))
                            .filter(item -> text(item, "createdAt").startsWith(month))
                            .map(item -> decimal(item, "totalAmount"))), "元", "本月新增应收单总额"),
                    metric("productionCompletionRate", "生产完工率", completionRate.toPlainString(), "%", "活动工单已报工数量 / 计划数量"),
                    metric("lowStockItems", "低水位预警物料", lowStockCount, "项", "可用量低于安全库存的物料"),
                    metric("attendanceRate", "今日出勤率", attendanceRate.toPlainString(), "%", "今日有效出勤员工 / 在职员工")
            );
            case "销售" -> List.of(
                    metric("newOrderAmount", "本月新增订单金额", sum(salesOrders.stream()
                            .filter(item -> text(item, "createdAt").startsWith(month))
                            .map(item -> decimal(item, "totalAmount"))), "元", "本月创建销售订单金额合计"),
                    metric("pendingOrderReviews", "待审核订单", salesOrders.stream()
                            .filter(item -> "PENDING".equals(text(item, "reviewStatus"))).count(), "单", "reviewStatus 为 PENDING 的销售订单"),
                    metric("dueDeliveryOrders", "临期交付订单", salesOrders.stream()
                            .filter(item -> !CLOSED_PRODUCTION.contains(text(item, "overallStatus")))
                            .filter(item -> between(date(item, "requestedDeliveryDate"), today, horizon)).count(), "单", "未来 7 天内到期且未关闭的订单"),
                    metric("openReceivable", "未结应收", sum(receivables.stream()
                            .filter(item -> OPEN_FINANCE.contains(text(item, "status")))
                            .map(item -> decimal(item, "outstandingAmount"))), "元", "pending 或 processing 应收未结金额")
            );
            case "计划员", "车间" -> List.of(
                    metric("pendingDemands", "待处理生产需求", pendingDemands.size(), "项", "已接收、校验、待评审或阻塞的需求"),
                    metric("activeWorkOrders", "活动工单", activeOrders.size(), "单", "未关闭且未取消的生产工单"),
                    metric("overdueWorkOrders", "逾期工单", overdueOrders.size(), "单", "到期日晚于今日且未完工的工单"),
                    metric("openFqc", "未关闭 FQC", openFqc.size(), "单", "未通过且未报废的完工检验单")
            );
            case "采购" -> List.of(
                    metric("pendingPurchaseRequests", "待审批采购申请", purchaseRequests.stream()
                            .filter(item -> "PENDING_APPROVAL".equals(text(item, "status"))).count(), "项", "PENDING_APPROVAL 状态的采购申请"),
                    metric("pendingPurchaseOrders", "待收货采购订单", purchaseOrders.stream()
                            .filter(item -> OPEN_PURCHASE_ORDERS.contains(text(item, "status"))).count(), "单", "已确认或部分收货的采购订单"),
                    metric("pendingPurchaseReceipts", "待检采购收货", purchaseReceipts.stream()
                            .filter(item -> PENDING_RECEIPTS.contains(text(item, "status"))).count(), "单", "待检验或检验中的采购收货单"),
                    metric("purchaseAmount", "本月采购金额", sum(purchaseOrders.stream()
                            .filter(item -> text(item, "createdAt").startsWith(month))
                            .map(item -> decimal(item, "totalAmount"))), "元", "本月创建采购订单金额合计")
            );
            case "仓管" -> List.of(
                    metric("pendingShipments", "待出库发货任务", shipmentTasks.stream()
                            .filter(item -> !Set.of("COMPLETED", "CANCELLED").contains(text(item, "workflowStatus"))).count(), "项", "未完成且未取消的仓库发货任务"),
                    metric("pendingPurchaseReceipts", "待检采购收货", purchaseReceipts.stream()
                            .filter(item -> PENDING_RECEIPTS.contains(text(item, "status"))).count(), "单", "待检验或检验中的采购收货单"),
                    metric("openStocktakes", "待处理盘点", stocktakes.stream()
                            .filter(item -> !Set.of("COMPLETED", "CANCELED").contains(text(item, "status"))).count(), "项", "未完成且未取消的盘点任务"),
                    metric("lowStockItems", "低水位预警物料", lowStockCount, "项", "可用量低于安全库存的物料")
            );
            default -> List.of(
                    metric("openReceivable", "未结应收", sum(receivables.stream()
                            .filter(item -> OPEN_FINANCE.contains(text(item, "status")))
                            .map(item -> decimal(item, "outstandingAmount"))), "元", "pending 或 processing 应收未结金额"),
                    metric("openPayable", "未结应付", sum(payables.stream()
                            .filter(item -> OPEN_FINANCE.contains(text(item, "status")))
                            .map(item -> decimal(item, "outstandingAmount"))), "元", "pending 或 processing 应付未结金额"),
                    metric("overdueReceivable", "逾期应收", receivables.stream()
                            .filter(item -> OPEN_FINANCE.contains(text(item, "status")))
                            .filter(item -> date(item, "dueDate").isBefore(LocalDate.parse(today))).count(), "单", "到期日早于今日且未结清的应收"),
                    metric("settlementDocuments", "待结算单据", receivables.stream().filter(item -> OPEN_FINANCE.contains(text(item, "status"))).count()
                            + payables.stream().filter(item -> OPEN_FINANCE.contains(text(item, "status"))).count(), "单", "未结应收与应付单据数量")
            );
        };

        List<Todo> todos = new ArrayList<>();
        if (Set.of("老板", "管理员", "超级管理员", "计划员", "车间").contains(role)) {
            pendingDemands.forEach(item -> todos.add(todo("生产管理", "ProductionDemand", item.value, "code",
                    "生产需求待处理", "dueDate", date(item.value, "dueDate").isBefore(LocalDate.parse(today)))));
            overdueOrders.forEach(item -> todos.add(todo("生产管理", "WorkOrder", item.value, "code",
                    "逾期工单待干预", "dueDate", true)));
            if ("车间".equals(role) || TENANT_ADMIN_ROLES.contains(role)) openFqc.forEach(item ->
                    todos.add(todo("生产管理", "Inspection", item.value, "code", "FQC 待处理", "createdAt", false)));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || "销售".equals(role)) {
            salesOrders.stream().filter(item -> "PENDING".equals(text(item, "reviewStatus"))).forEach(item ->
                    todos.add(todo("销售管理", "SalesOrder", item, "orderNo", "销售订单待审核", "createdAt", false)));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || List.of("采购", "仓管").contains(role)) {
            purchaseRequests.stream().filter(item -> "PENDING_APPROVAL".equals(text(item, "status"))).forEach(item ->
                    todos.add(todo("采购管理", "PurchaseRequest", item, "requestNo", "采购申请待审批", "createdAt", false)));
            purchaseReceipts.stream().filter(item -> PENDING_RECEIPTS.contains(text(item, "status"))).forEach(item ->
                    todos.add(todo("库存管理", "PurchaseReceipt", item, "receiptNo", "采购收货待检验", "receivedAt", false)));
            stocktakes.stream().filter(item -> !Set.of("COMPLETED", "CANCELED").contains(text(item, "status"))).forEach(item ->
                    todos.add(todo("库存管理", "StocktakeTask", item, "taskNo", "盘点任务待处理", "plannedDate", false)));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || "仓管".equals(role)) {
            shipmentTasks.stream().filter(item -> !Set.of("COMPLETED", "CANCELLED").contains(text(item, "workflowStatus"))).forEach(item ->
                    todos.add(todo("库存管理", "ShipmentTask", item, "taskNo", "发货任务待出库", "createdAt", false)));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || List.of("销售", "财务").contains(role)) {
            receivables.stream().filter(item -> OPEN_FINANCE.contains(text(item, "status"))
                    && date(item, "dueDate").isBefore(LocalDate.parse(today))).forEach(item ->
                    todos.add(todo("财务管理", "Receivable", item, "docNo", "逾期应收待跟进", "dueDate", true)));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || "财务".equals(role)) {
            payables.stream().filter(item -> OPEN_FINANCE.contains(text(item, "status"))).limit(10).forEach(item ->
                    todos.add(todo("财务管理", "Payable", item, "docNo", "应付单据待结算", "dueDate",
                            date(item, "dueDate").isBefore(LocalDate.parse(today)))));
        }
        if (TENANT_ADMIN_ROLES.contains(role) || "人事".equals(role)) {
            skills.stream().filter(item -> "已过期".equals(text(item, "status"))).forEach(item ->
                    todos.add(todo("人员管理", "Skill", item, "certNo", "证书已过期待处理", "expiryDate", true)));
            skills.stream().filter(item -> "即将到期".equals(text(item, "status"))).forEach(item ->
                    todos.add(todo("人员管理", "Skill", item, "certNo", "证书即将到期", "expiryDate", false)));
        }

        List<Alert> alerts = new ArrayList<>();
        aiInsights.stream().sorted(Comparator.comparing((AbstractAiStore.Insight item) -> severityOrder(item.severity())))
                .limit(6).forEach(item -> alerts.add(new Alert(aiModule(item.domain()), alertSeverity(item.severity()),
                        item.title(), item.summary(), item.id(), item.insightNo())));
        if (!overdueOrders.isEmpty()) alerts.add(new Alert("生产管理", "high", "生产工单逾期",
                "有 " + overdueOrders.size() + " 张工单已逾期，需要排产或报工干预。", null, null));
        if (!supplyRisks.isEmpty()) alerts.add(new Alert("产业链管理", "medium", "供应链活跃风险",
                "有 " + supplyRisks.size() + " 条供应链风险事件处于活跃状态。", null, null));
        if (lowStockCount > 0) alerts.add(new Alert("库存管理", "medium", "库存低于安全水位",
                "有 " + lowStockCount + " 项物料可用量低于安全库存。", null, null));
        alerts.sort(Comparator.comparing(item -> severityOrder(item.severity())));

        boolean tenantWide = TENANT_ADMIN_ROLES.contains(role) || context.permissions().contains("*");
        List<AbstractMessageStore.MessageRecord> messageRecords = messageStore.records(
                tenantId, 1, 50, tenantWide ? null : context.actorId(), null, null, false, null, null, null
        ).items().stream().filter(item -> !item.isArchived() || tenantWide).toList();
        List<AbstractMessageStore.MessageRecord> scopedMessages = messageRecords.stream()
                .filter(item -> eventScope == null || "ALL".equals(eventScope) || isKeyEvent(item))
                .toList();
        List<Activity> activities = scopedMessages.stream().map(item -> new Activity(
                item.id(), item.title(), item.body(), messageModule(item.category()), item.sourceType(),
                item.sourceId(), item.sourceDocNo() == null || item.sourceDocNo().isBlank() ? item.msgNo() : item.sourceDocNo(),
                item.sentAt() == null ? item.createdAt() : item.sentAt()
        )).toList();

        // B-08: 搜索过滤 + sections 分区
        String keyword = (search != null && !search.isBlank()) ? search.trim().toLowerCase(Locale.ROOT) : null;
        List<String> sectionList = (sections != null && !sections.isBlank())
                ? Arrays.asList(sections.split(","))
                : List.of("metrics", "todos", "alerts", "activities");
        if (sectionList.stream().anyMatch(item -> !Set.of("metrics", "todos", "alerts", "activities").contains(item))) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_SECTION",
                    "sections包含不支持的工作台分区", "使用 metrics,todos,alerts,activities");
        }

        List<Todo> filteredTodos = keyword == null ? todos : todos.stream().filter(item -> matchesSearch(keyword,
                item.title(), item.module(), item.sourceType(), item.sourceId(), item.sourceNo(), item.dueDate()))
                .collect(Collectors.toList());
        List<Alert> filteredAlerts = keyword == null ? alerts : alerts.stream().filter(item -> matchesSearch(keyword,
                item.title(), item.detail(), item.module(), item.severity(), item.sourceId(), item.sourceNo()))
                .collect(Collectors.toList());
        List<Activity> filteredActivities = keyword == null ? activities : activities.stream().filter(item ->
                matchesSearch(keyword, item.title(), item.detail(), item.module(), item.sourceType(), item.sourceId(),
                        item.sourceNo(), item.occurredAt())).collect(Collectors.toList());
        int safeOffset = Math.min(activityOffset, Math.max(filteredActivities.size() - 1, 0));
        int activityTo = Math.min(safeOffset + activityLimit, filteredActivities.size());
        List<Activity> activityPage = safeOffset >= filteredActivities.size()
                ? List.of() : filteredActivities.subList(safeOffset, activityTo);
        boolean activitiesHasMore = activityTo < filteredActivities.size();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("role", role);
        if (sectionList.contains("metrics")) response.put("metrics", metrics);
        if (sectionList.contains("todos"))
            response.put("todos", filteredTodos.size() > todoLimit
                    ? filteredTodos.subList(0, todoLimit) : filteredTodos);
        if (sectionList.contains("alerts"))
            response.put("alerts", filteredAlerts.size() > 9 ? filteredAlerts.subList(0, 9) : filteredAlerts);
        if (sectionList.contains("activities"))
            response.put("activities", activityPage);
        response.put("schemaVersion", "1.1");
        response.put("requestedSections", sectionList);
        response.put("businessDate", today);
        response.put("timeZone", ZONE.getId());
        response.put("eventScope", eventScope);
        response.put("todoTotal", filteredTodos.size());
        response.put("alertTotal", filteredAlerts.size());
        response.put("activitiesHasMore", activitiesHasMore);
        response.put("nextCursor", activitiesHasMore ? encodeActivityCursor(activityTo) : null);
        response.put("generatedAt", Instant.now().toString());
        response.put("dataAsOf", Instant.now().minusSeconds(30).toString());
        response.put("sourceVersion", "wb-v1");
        response.put("dataScope", Map.of("tenantId", tenantId));
        return response;
    }

    private String businessDate(String value) {
        if (value == null || value.isBlank()) return LocalDate.now(ZONE).toString();
        try {
            LocalDate parsed = LocalDate.parse(value);
            LocalDate today = LocalDate.now(ZONE);
            if (parsed.isAfter(today) || parsed.isBefore(today.minusDays(365))) {
                throw new ApiException(400, "WORKBENCH_400_INVALID_DATE",
                        "业务日期只允许当天或过去365天", "调整date后重试");
            }
            return parsed.toString();
        } catch (java.time.format.DateTimeParseException exception) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_DATE",
                    "date必须是YYYY-MM-DD格式", "使用合法业务日期重试");
        }
    }

    private void validateLimits(int todoLimit, int activityLimit) {
        if (todoLimit < 1 || todoLimit > 50 || activityLimit < 1 || activityLimit > 50) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_LIMIT",
                    "todoLimit和activityLimit必须是1-50", "调整分页参数后重试");
        }
    }

    private boolean isKeyEvent(AbstractMessageStore.MessageRecord item) {
        return "high".equalsIgnoreCase(item.priority())
                || item.metadata() != null && Boolean.TRUE.equals(item.metadata().get("keyEvent"));
    }

    private String encodeActivityCursor(int offset) {
        return java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(("wb-activity-v1:" + offset).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private int decodeActivityCursor(String value) {
        if (value == null || value.isBlank()) return 0;
        try {
            String decoded = new String(java.util.Base64.getUrlDecoder().decode(value),
                    java.nio.charset.StandardCharsets.UTF_8);
            if (!decoded.startsWith("wb-activity-v1:")) throw new IllegalArgumentException();
            int offset = Integer.parseInt(decoded.substring("wb-activity-v1:".length()));
            if (offset < 0) throw new IllegalArgumentException();
            return offset;
        } catch (RuntimeException exception) {
            throw new ApiException(400, "WORKBENCH_400_INVALID_CURSOR",
                    "cursor无效或已过期", "从第一页重新读取动态");
        }
    }

    

    private Metric metric(String key, String title, Object value, String unit, String definition) {
        return new Metric(key, title, String.valueOf(value), unit, definition);
    }

    private Metric metric(String key, String title, long value, String unit, String definition) {
        return metric(key, title, BigDecimal.valueOf(value), unit, definition);
    }

    private boolean matchesSearch(String keyword, String... searchableValues) {
        return Arrays.stream(searchableValues)
                .anyMatch(value -> value != null && value.toLowerCase(Locale.ROOT).contains(keyword));
    }

    private Metric metric(String key, String title, int value, String unit, String definition) {
        return metric(key, title, BigDecimal.valueOf(value), unit, definition);
    }

    private Todo todo(String module, String sourceType, com.fasterxml.jackson.databind.JsonNode source,
                      String numberField, String title, String dateField, boolean urgent) {
        return new Todo(module, sourceType, text(source, "id"), firstText(source, numberField, "code"),
                title, source.path(dateField).asText(null), urgent);
    }

    private BigDecimal sum(java.util.stream.Stream<BigDecimal> values) {
        return values.reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal percent(BigDecimal value, BigDecimal total) {
        if (total.signum() <= 0) return new BigDecimal("0.00");
        return value.multiply(BigDecimal.valueOf(100)).divide(total, 2, RoundingMode.DOWN);
    }

    private LocalDate date(com.fasterxml.jackson.databind.JsonNode value, String field) {
        String text = text(value, field);
        if (text.isBlank()) return LocalDate.MAX;
        try {
            return text.length() >= 10 ? LocalDate.parse(text.substring(0, 10)) : LocalDate.of(1970, 1, 1);
        } catch (RuntimeException exception) {
            return LocalDate.of(1970, 1, 1);
        }
    }

    private boolean between(LocalDate value, String start, String end) {
        return !value.isBefore(LocalDate.parse(start)) && !value.isAfter(LocalDate.parse(end));
    }

    private String firstText(com.fasterxml.jackson.databind.JsonNode value, String first, String second) {
        String result = text(value, first);
        return result.isBlank() ? text(value, second) : result;
    }

    private int severityOrder(String severity) {
        return switch (severity == null ? "" : severity.toLowerCase()) {
            case "critical", "high" -> 0;
            case "medium", "warning" -> 1;
            default -> 2;
        };
    }

    private String alertSeverity(String severity) {
        return switch (severity == null ? "" : severity.toLowerCase()) {
            case "critical", "high" -> "high";
            case "medium", "warning" -> "medium";
            default -> "low";
        };
    }

    private String aiModule(String domain) {
        return switch (domain == null ? "" : domain) {
            case "sales" -> "销售管理";
            case "inventory" -> "库存管理";
            case "procurement" -> "采购管理";
            case "finance" -> "财务管理";
            case "production" -> "生产管理";
            default -> "AI数据分析";
        };
    }

    private String messageModule(String category) {
        return switch (category == null ? "" : category.toLowerCase()) {
            case "sales", "order" -> "销售管理";
            case "production" -> "生产管理";
            case "inventory", "shipping" -> "库存管理";
            case "procurement" -> "采购管理";
            case "finance", "payment" -> "财务管理";
            case "personnel", "hr" -> "人员管理";
            case "ai" -> "AI数据分析";
            case "platform", "system" -> "平台管理";
            default -> "消息管理";
        };
    }

    private FinanceFilter financeFilter() {
        return new FinanceFilter(null, null, null, 1, Integer.MAX_VALUE);
    }

    private String text(com.fasterxml.jackson.databind.JsonNode value, String field) {
        return value.path(field).asText("");
    }

    private com.fasterxml.jackson.databind.JsonNode json(Object value) {
        return mapper.valueToTree(value);
    }

    private BigDecimal decimal(com.fasterxml.jackson.databind.JsonNode value, String field) {
        try {
            return new BigDecimal(value.path(field).asText("0"));
        } catch (NumberFormatException exception) {
            return BigDecimal.ZERO;
        }
    }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED",
                    "缺少操作权限：" + permission, "请联系管理员授予工作台查看权限");
        }
    }

    private record JsonSnapshot(com.fasterxml.jackson.databind.JsonNode value) {}
}
