package com.wanshen.platform.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class AiBusinessQueryService {
    private static final Logger log = LoggerFactory.getLogger(AiBusinessQueryService.class);
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final DataSource dataSource;
    private final ObjectMapper objectMapper;

    @Autowired
    public AiBusinessQueryService(ObjectProvider<DataSource> dataSourceProvider, ObjectMapper objectMapper) {
        this.dataSource = dataSourceProvider.getIfAvailable();
        this.objectMapper = objectMapper;
    }

    AiBusinessQueryService(DataSource dataSource, ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
    }

    public Optional<String> answer(String message, String tenantId) {
        if (dataSource == null || tenantId == null || tenantId.isBlank()) return Optional.empty();
        try {
            return Optional.ofNullable(selectAnswer(message, tenantId));
        } catch (Exception exception) {
            log.warn("AI business query failed for tenant {}", tenantId, exception);
            return Optional.empty();
        }
    }

    private String selectAnswer(String message, String tenantId) throws Exception {
        return switch (message) {
            case "低库存物料查询" -> lowStock(tenantId);
            case "缺料风险" -> shortageRisk(tenantId);
            case "安全水位" -> safetyStockLevel(tenantId);
            case "库存账龄" -> inventoryAging(tenantId);
            case "呆滞料识别" -> stagnantInventory(tenantId);
            case "订单状态查询" -> salesOrderStatus(tenantId);
            case "发货进度跟进" -> shipmentProgress(tenantId);
            case "待确认订单" -> pendingSalesOrders(tenantId);
            case "客户档案" -> customerProfiles(tenantId);
            case "工单状态" -> workOrderStatus(tenantId);
            case "排产计划" -> productionSchedule(tenantId);
            case "报工进度" -> productionReportProgress(tenantId);
            case "完工入库" -> completionInbound(tenantId);
            case "FQC检验通过率" -> fqcPassRate(tenantId);
            case "PR/PO状态" -> purchaseDocumentStatus(tenantId);
            case "供应商交期预警" -> supplierDeliveryWarnings(tenantId);
            case "到货跟踪" -> purchaseReceiptTracking(tenantId);
            case "延迟风险" -> procurementDelayRisk(tenantId);
            default -> null;
        };
    }

    private String lowStock(String tenantId) throws Exception {
        List<StockFact> values = availability(tenantId).stream()
                .filter(item -> item.safetyStockQty().compareTo(BigDecimal.ZERO) > 0)
                .filter(item -> item.fulfillableQty().compareTo(item.safetyStockQty()) < 0)
                .sorted(Comparator.comparing(StockFact::shortageQty).reversed())
                .limit(8)
                .toList();
        if (values.isEmpty()) return "当前库存可用量均不低于安全库存，没有低库存物料。";
        StringBuilder reply = new StringBuilder("数据库当前有 ").append(values.size())
                .append(" 条库存低于安全水位：\n");
        values.forEach(item -> reply.append("- ").append(item.productId())
                .append(" @ ").append(item.warehouseId())
                .append("：可用 ").append(format(item.fulfillableQty())).append(" ").append(item.uom())
                .append("，安全 ").append(format(item.safetyStockQty()))
                .append("，缺口 ").append(format(item.shortageQty())).append('\n'));
        appendSource(reply, maxUpdated(values.stream().map(StockFact::updatedAt).toList()));
        return reply.toString().trim();
    }

    private String shortageRisk(String tenantId) throws Exception {
        List<StockFact> values = availability(tenantId).stream()
                .filter(item -> item.shortageQty().compareTo(BigDecimal.ZERO) > 0)
                .sorted(Comparator.comparing(StockFact::shortageQty).reversed())
                .toList();
        if (values.isEmpty()) return "按当前库存、安全水位和在途数量计算，暂未识别缺料风险。";
        StringBuilder reply = new StringBuilder("识别到 ").append(values.size()).append(" 项缺料风险：\n");
        values.forEach(item -> reply.append("- ").append(item.productId())
                .append("：缺口 ").append(format(item.shortageQty())).append(" ").append(item.uom())
                .append("（可用 ").append(format(item.fulfillableQty()))
                .append("，在途 ").append(format(item.inTransitQty()))
                .append("，安全 ").append(format(item.safetyStockQty())).append("）\n"));
        appendSource(reply, maxUpdated(values.stream().map(StockFact::updatedAt).toList()));
        return reply.toString().trim();
    }

    private String safetyStockLevel(String tenantId) throws Exception {
        List<StockFact> values = availability(tenantId);
        List<StockFact> controlled = values.stream()
                .filter(item -> item.safetyStockQty().compareTo(BigDecimal.ZERO) > 0).toList();
        if (controlled.isEmpty()) return "当前库存可用量记录没有设置安全库存，无法计算水位达标率。";
        long below = controlled.stream().filter(item -> item.shortageQty().compareTo(BigDecimal.ZERO) > 0).count();
        BigDecimal available = controlled.stream().map(StockFact::fulfillableQty)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal safety = controlled.stream().map(StockFact::safetyStockQty)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return "共 " + controlled.size() + " 条安全库存受控记录，低于安全水位 " + below
                + " 条，达标率 " + percent(controlled.size() - below, controlled.size())
                + "。可用合计 " + format(available) + "，安全库存合计 " + format(safety) + "。"
                + sourceSuffix(maxUpdated(values.stream().map(StockFact::updatedAt).toList()));
    }

    private String inventoryAging(String tenantId) throws Exception {
        Map<String, Instant> movements = lastMovements(tenantId, null);
        if (movements.isEmpty()) return "库存交易流水当前为 0 条，暂不能计算真实库存账龄。";
        List<Map.Entry<String, Instant>> ranked = movements.entrySet().stream()
                .sorted(Comparator.comparing(Map.Entry::getValue))
                .limit(8).toList();
        StringBuilder reply = new StringBuilder("按最近一次库存移动计算，账龄最长的记录：\n");
        ranked.forEach(item -> {
            long days = Duration.between(item.getValue(), Instant.now()).toDays();
            reply.append("- ").append(item.getKey()).append("：").append(days).append(" 天前移动（")
                    .append(dateText(item.getValue())).append("）\n");
        });
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String stagnantInventory(String tenantId) throws Exception {
        List<StockFact> values = availability(tenantId).stream()
                .filter(item -> item.fulfillableQty().compareTo(BigDecimal.ZERO) > 0).toList();
        Map<String, Instant> outbound = lastMovements(tenantId, "%OUTBOUND%");
        Instant boundary = Instant.now().minus(Duration.ofDays(90));
        List<StockFact> stagnant = values.stream()
                .filter(item -> outbound.getOrDefault(item.key(), Instant.EPOCH).isBefore(boundary))
                .limit(8).toList();
        if (stagnant.isEmpty()) return "过去 90 天内没有识别到呆滞库存记录。";
        StringBuilder reply = new StringBuilder("过去 90 天无出库且仍有可用量的库存有 ")
                .append(stagnant.size()).append(" 条：\n");
        stagnant.forEach(item -> reply.append("- ").append(item.productId())
                .append(" @ ").append(item.warehouseId())
                .append("：可用 ").append(format(item.fulfillableQty())).append(" ").append(item.uom()).append('\n'));
        appendSource(reply, maxUpdated(values.stream().map(StockFact::updatedAt).toList()));
        return reply.toString().trim();
    }

    private String salesOrderStatus(String tenantId) throws Exception {
        List<JsonNode> orders = documents(tenantId, "fulfillment", "order", 100);
        if (orders.isEmpty()) return "数据库中当前没有销售订单。";
        Map<String, Long> counts = counts(orders, "overallStatus");
        StringBuilder reply = new StringBuilder("销售订单共 ").append(orders.size()).append(" 单：");
        reply.append(counts.entrySet().stream()
                .map(item -> orderStatusLabel(item.getKey()) + " " + item.getValue())
                .reduce((left, right) -> left + "，" + right).orElse("无状态明细")).append("。\n最近订单：\n");
        orders.stream().limit(5).forEach(order -> reply.append("- ").append(text(order, "orderNo"))
                .append(" / ").append(text(order, "customerName"))
                .append(" / ").append(orderStatusLabel(text(order, "overallStatus")))
                .append(" / 金额 ").append(format(decimal(order, "totalAmount"))).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String shipmentProgress(String tenantId) throws Exception {
        List<JsonNode> orders = documents(tenantId, "fulfillment", "order", 100);
        if (orders.isEmpty()) return "数据库中当前没有可跟踪的销售发货单。";
        Map<String, Long> counts = counts(orders, "shipmentStatus");
        StringBuilder reply = new StringBuilder("发货进度：全部发货 ").append(counts.getOrDefault("SHIPPED", 0L))
                .append(" 单，部分发货 ").append(counts.getOrDefault("PARTIALLY_SHIPPED", 0L))
                .append(" 单，已申请 ").append(counts.getOrDefault("REQUESTED", 0L))
                .append(" 单，未申请 ").append(counts.getOrDefault("NOT_REQUESTED", 0L)).append(" 单。\n");
        orders.stream().filter(order -> !"SHIPPED".equals(text(order, "shipmentStatus"))).limit(5)
                .forEach(order -> reply.append("- ").append(text(order, "orderNo"))
                        .append(" / ").append(shipmentStatusLabel(text(order, "shipmentStatus")))
                        .append(" / 交期 ").append(text(order, "requestedDeliveryDate")).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String pendingSalesOrders(String tenantId) throws Exception {
        List<JsonNode> orders = documents(tenantId, "fulfillment", "order", 100).stream()
                .filter(order -> "PENDING_CONFIRMATION".equals(text(order, "overallStatus"))).toList();
        if (orders.isEmpty()) return "当前没有待确认销售订单。";
        StringBuilder reply = new StringBuilder("待确认销售订单 ").append(orders.size()).append(" 单：\n");
        orders.forEach(order -> reply.append("- ").append(text(order, "orderNo"))
                .append(" / ").append(text(order, "customerName"))
                .append(" / 金额 ").append(format(decimal(order, "totalAmount")))
                .append(" / 交期 ").append(text(order, "requestedDeliveryDate")).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String customerProfiles(String tenantId) throws Exception {
        List<JsonNode> customers = documents(tenantId, "supplychain", "customer", 20);
        if (customers.isEmpty()) return "数据库中当前没有客户档案。";
        StringBuilder reply = new StringBuilder("客户档案共 ").append(customers.size()).append(" 家：\n");
        customers.forEach(customer -> reply.append("- ").append(text(customer, "customerNo"))
                .append(" / ").append(text(customer, "name"))
                .append(" / 状态 ").append(text(customer, "status", "未填写")).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String workOrderStatus(String tenantId) throws Exception {
        List<JsonNode> workOrders = documents(tenantId, "production", "workOrder", 100);
        if (workOrders.isEmpty()) return "数据库中当前没有生产工单。";
        Map<String, Long> counts = counts(workOrders, "status");
        StringBuilder reply = new StringBuilder("生产工单共 ").append(workOrders.size()).append(" 单：");
        reply.append(counts.entrySet().stream()
                .map(item -> productionStatusLabel(item.getKey()) + " " + item.getValue())
                .reduce((left, right) -> left + "，" + right).orElse("无状态明细")).append("。\n");
        workOrders.stream().limit(5).forEach(order -> {
            BigDecimal planned = decimal(order, "plannedQty");
            BigDecimal completed = decimal(order, "reportedGoodQty");
            reply.append("- ").append(text(order, "code"))
                    .append(" / ").append(productionStatusLabel(text(order, "status")))
                    .append(" / 完成 ").append(percent(completed, planned))
                    .append(" / 交期 ").append(text(order, "dueDate", "未设置")).append('\n');
        });
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String productionSchedule(String tenantId) throws Exception {
        List<JsonNode> workOrders = documents(tenantId, "production", "workOrder", 100).stream()
                .filter(order -> !java.util.Set.of("COMPLETED", "CLOSED").contains(text(order, "status")))
                .sorted(Comparator.comparing(order -> text(order, "dueDate", "9999-12-31")))
                .toList();
        if (workOrders.isEmpty()) return "当前没有待执行生产工单。";
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        StringBuilder reply = new StringBuilder("未来执行计划共 ").append(workOrders.size()).append(" 单：\n");
        workOrders.stream().limit(8).forEach(order -> {
            long days = parseDate(text(order, "dueDate")) == null ? Long.MAX_VALUE
                    : Duration.between(today.atStartOfDay(BUSINESS_ZONE).toInstant(),
                    parseDate(text(order, "dueDate")).atStartOfDay(BUSINESS_ZONE).toInstant()).toDays();
            reply.append("- ").append(text(order, "code"))
                    .append(" / ").append(text(order, "productName"))
                    .append(" / 数量 ").append(format(decimal(order, "plannedQty")))
                    .append(" / 交期 ").append(text(order, "dueDate"))
                    .append(days < 0 ? "（已逾期）" : "（剩余 " + days + " 天）").append('\n');
        });
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String productionReportProgress(String tenantId) throws Exception {
        List<JsonNode> workOrders = documents(tenantId, "production", "workOrder", 100);
        if (workOrders.isEmpty()) return "数据库中当前没有可统计的报工工单。";
        BigDecimal planned = sum(workOrders, "plannedQty");
        BigDecimal good = sum(workOrders, "reportedGoodQty");
        BigDecimal defect = sum(workOrders, "reportedDefectQty").add(sum(workOrders, "reportedScrapQty"));
        return "工单计划合计 " + format(planned) + "，合格报工 " + format(good)
                + "，整体完成率 " + percent(good, planned) + "，不良/报废 " + format(defect) + "。"
                + sourceSuffix(Optional.empty());
    }

    private String completionInbound(String tenantId) throws Exception {
        List<JsonNode> completions = tableRows(tenantId, """
                SELECT jsonb_build_object('code', code, 'status', status, 'quantity', qty,
                    'createdAt', created_at) AS document
                FROM prod_completion WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 8
                """, 8);
        if (completions.isEmpty()) return "数据库完工入库记录当前为 0 条。";
        StringBuilder reply = new StringBuilder("最近完工入库 ").append(completions.size()).append(" 条：\n");
        completions.forEach(item -> reply.append("- ").append(text(item, "code"))
                .append(" / 数量 ").append(format(decimal(item, "quantity")))
                .append(" / 状态 ").append(productionStatusLabel(text(item, "status"))).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String fqcPassRate(String tenantId) throws Exception {
        List<JsonNode> inspections = documents(tenantId, "production", "inspection", 100).stream()
                .filter(item -> "FQC".equals(text(item, "inspectionType"))).toList();
        if (inspections.isEmpty()) return "数据库中当前没有 FQC 检验记录。";
        BigDecimal sample = sum(inspections, "sampleQty");
        BigDecimal passed = sum(inspections, "passedQty");
        BigDecimal failed = sum(inspections, "failedQty");
        BigDecimal judged = passed.add(failed);
        StringBuilder reply = new StringBuilder("FQC 记录 ").append(inspections.size())
                .append(" 条，抽检合计 ").append(format(sample))
                .append("，已判定 ").append(format(judged))
                .append("，判定通过率 ").append(percent(passed, judged)).append("。\n");
        inspections.stream().limit(5).forEach(item -> reply.append("- ").append(text(item, "code"))
                .append(" / ").append(productionStatusLabel(text(item, "status")))
                .append(" / 通过 ").append(format(decimal(item, "passedQty")))
                .append("，不良 ").append(format(decimal(item, "failedQty"))).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String purchaseDocumentStatus(String tenantId) throws Exception {
        List<JsonNode> requests = documents(tenantId, "fulfillment", "purchaseRequest", 100);
        List<JsonNode> orders = documents(tenantId, "fulfillment", "purchaseOrder", 100);
        if (requests.isEmpty() && orders.isEmpty()) return "数据库中当前没有采购申请或采购订单。";
        return "采购申请 " + requests.size() + " 单（待审批 "
                + counts(requests, "status").getOrDefault("PENDING_APPROVAL", 0L)
                + "），采购订单 " + orders.size() + " 单（未收完 "
                + orders.stream().filter(item -> !java.util.Set.of("RECEIVED", "CANCELED")
                        .contains(text(item, "status"))).count()
                + "）。" + sourceSuffix(Optional.empty());
    }

    private String supplierDeliveryWarnings(String tenantId) throws Exception {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        List<JsonNode> delayed = documents(tenantId, "fulfillment", "purchaseOrder", 100).stream()
                .filter(order -> !java.util.Set.of("RECEIVED", "CANCELED").contains(text(order, "status")))
                .filter(order -> {
                    LocalDate promised = parseDate(text(order, "promisedDate"));
                    return promised != null && promised.isBefore(today);
                })
                .sorted(Comparator.comparing(order -> text(order, "promisedDate")))
                .toList();
        if (delayed.isEmpty()) return "当前没有未收货且已超过承诺交期的采购订单。";
        StringBuilder reply = new StringBuilder("识别到 ").append(delayed.size())
                .append(" 笔供应商交期预警：\n");
        delayed.forEach(order -> reply.append("- ").append(text(order, "orderNo"))
                .append(" / ").append(text(order, "supplierName"))
                .append(" / 物料 ").append(text(order, "materialId"))
                .append(" / 承诺 ").append(text(order, "promisedDate"))
                .append(" / 未收 ").append(format(decimal(order, "orderedQty")
                        .subtract(decimal(order, "receivedQty")))).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String purchaseReceiptTracking(String tenantId) throws Exception {
        List<JsonNode> receipts = documents(tenantId, "fulfillment", "purchaseReceipt", 100);
        if (receipts.isEmpty()) return "数据库采购收货记录当前为 0 条。";
        StringBuilder reply = new StringBuilder("最近采购收货 ").append(receipts.size()).append(" 条：\n");
        receipts.forEach(receipt -> reply.append("- ").append(text(receipt, "receiptNo"))
                .append(" / 状态 ").append(text(receipt, "status"))
                .append(" / 时间 ").append(text(receipt, "receivedAt", text(receipt, "createdAt"))).append('\n'));
        appendSource(reply, Optional.empty());
        return reply.toString().trim();
    }

    private String procurementDelayRisk(String tenantId) throws Exception {
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        List<JsonNode> orders = documents(tenantId, "fulfillment", "purchaseOrder", 100);
        List<JsonNode> requests = documents(tenantId, "fulfillment", "purchaseRequest", 100);
        long delayed = orders.stream().filter(order -> !java.util.Set.of("RECEIVED", "CANCELED")
                .contains(text(order, "status")))
                .filter(order -> parseDate(text(order, "promisedDate")) != null
                        && parseDate(text(order, "promisedDate")).isBefore(today)).count();
        long pending = counts(requests, "status").getOrDefault("PENDING_APPROVAL", 0L);
        long partial = orders.stream().filter(order -> "PARTIALLY_RECEIVED".equals(text(order, "status"))).count();
        return "采购延迟风险：逾期未收 " + delayed + " 笔，部分收货 " + partial + " 笔，申请待审批 "
                + pending + " 笔。" + sourceSuffix(Optional.empty());
    }

    private List<StockFact> availability(String tenantId) throws Exception {
        return documents(tenantId, "fulfillment", "availability", 200).stream()
                .map(item -> new StockFact(
                        text(item, "productId"), text(item, "warehouseId"),
                        decimal(item, "onHandQty"), decimal(item, "qualifiedOnHandQty"),
                        decimal(item, "reservedQty"), decimal(item, "inTransitQty"),
                        decimal(item, "fulfillableQty"), decimal(item, "safetyStockQty"),
                        text(item, "uom", "PCS"), text(item, "updatedAt")))
                .toList();
    }

    private Map<String, Instant> lastMovements(String tenantId, String typePattern) throws Exception {
        Map<String, Instant> result = new LinkedHashMap<>();
        String sql = """
                SELECT warehouse_id, product_id, MAX(occurred_at) AS last_movement
                FROM inv_transaction WHERE tenant_id = ?
                """ + (typePattern == null ? "" : " AND transaction_type LIKE ? ") + """
                GROUP BY warehouse_id, product_id
                """;
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, tenantId);
                if (typePattern != null) statement.setString(2, typePattern);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) {
                        Timestamp value = resultSet.getTimestamp("last_movement");
                        if (value != null) {
                            result.put(resultSet.getString("warehouse_id") + ":" + resultSet.getString("product_id"),
                                    value.toInstant());
                        }
                    }
                }
            }
            connection.commit();
        }
        return result;
    }

    private List<JsonNode> documents(String tenantId, String module, String kind, int limit) throws Exception {
        return jsonRows(tenantId, """
                SELECT data::text AS document FROM module_document
                WHERE module = ? AND tenant_id = ? AND kind = ?
                ORDER BY updated_at DESC LIMIT ?
                """, statement -> {
            statement.setString(1, module);
            statement.setString(2, tenantId);
            statement.setString(3, kind);
            statement.setInt(4, limit);
        });
    }

    private List<JsonNode> tableRows(String tenantId, String sql, int limit) throws Exception {
        return jsonRows(tenantId, "SELECT document FROM (" + sql + ") business_query",
                statement -> statement.setString(1, tenantId));
    }

    private interface Binder { void bind(PreparedStatement statement) throws Exception; }

    private List<JsonNode> jsonRows(String tenantId, String sql, Binder binder) throws Exception {
        List<JsonNode> result = new ArrayList<>();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                binder.bind(statement);
                try (ResultSet resultSet = statement.executeQuery()) {
                    while (resultSet.next()) {
                        result.add(objectMapper.readTree(resultSet.getString("document")));
                    }
                }
            }
            connection.commit();
        }
        return result;
    }

    private void bindTenant(Connection connection, String tenantId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            statement.setString(1, tenantId);
            statement.executeQuery();
        }
    }

    private record StockFact(
            String productId, String warehouseId, BigDecimal onHandQty, BigDecimal qualifiedQty,
            BigDecimal reservedQty, BigDecimal inTransitQty, BigDecimal fulfillableQty,
            BigDecimal safetyStockQty, String uom, String updatedAt
    ) {
        private BigDecimal shortageQty() {
            return safetyStockQty.subtract(fulfillableQty).max(BigDecimal.ZERO);
        }
        private String key() { return warehouseId + ":" + productId; }
    }

    private Map<String, Long> counts(List<JsonNode> values, String field) {
        Map<String, Long> result = new LinkedHashMap<>();
        values.forEach(item -> result.merge(text(item, field, "UNKNOWN"), 1L, Long::sum));
        return result;
    }

    private BigDecimal sum(List<JsonNode> values, String field) {
        return values.stream().map(item -> decimal(item, field)).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Optional<Instant> maxUpdated(List<String> values) {
        return values.stream().filter(value -> !value.isBlank()).map(this::instant)
                .filter(Optional::isPresent).map(Optional::get).max(Instant::compareTo);
    }

    private Optional<Instant> instant(String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        try { return Optional.of(Instant.parse(value)); }
        catch (DateTimeParseException exception) { return Optional.empty(); }
    }

    private LocalDate parseDate(String value) {
        try { return value == null || value.isBlank() ? null : LocalDate.parse(value.substring(0, 10)); }
        catch (RuntimeException exception) { return null; }
    }

    private void appendSource(StringBuilder reply, Optional<Instant> updatedAt) {
        reply.append(sourceSuffix(updatedAt));
    }

    private String sourceSuffix(Optional<Instant> updatedAt) {
        return "数据来源：业务数据库" + updatedAt.map(time -> "，更新于 " + dateText(time)).orElse("") + "。";
    }

    private String orderStatusLabel(String value) {
        return switch (value) {
            case "PENDING_CONFIRMATION" -> "待确认";
            case "CONFIRMED" -> "已确认";
            case "REPLENISHING" -> "生产补货中";
            case "PARTIALLY_SHIPPED" -> "部分发货";
            case "SHIPPED" -> "已发货";
            case "CANCELED" -> "已取消";
            default -> value;
        };
    }

    private String shipmentStatusLabel(String value) {
        return switch (value) {
            case "NOT_REQUESTED" -> "未申请";
            case "REQUESTED" -> "已申请";
            case "PARTIALLY_SHIPPED" -> "部分发货";
            case "SHIPPED" -> "已发货";
            default -> value;
        };
    }

    private String productionStatusLabel(String value) {
        return switch (value) {
            case "PLANNED" -> "计划中";
            case "RELEASED" -> "已下达";
            case "IN_PROGRESS" -> "执行中";
            case "COMPLETED" -> "已完工";
            case "CLOSED" -> "已结案";
            case "CREATED" -> "待检验";
            case "DISPOSITION_PENDING" -> "处置待定";
            case "PENDING_APPROVAL" -> "待审批";
            case "CONFIRMED" -> "已确认";
            case "PARTIALLY_RECEIVED" -> "部分收货";
            case "RECEIVED" -> "已收货";
            default -> value;
        };
    }

    private String text(JsonNode value, String field) { return text(value, field, ""); }

    private String text(JsonNode value, String field, String fallback) {
        return value.hasNonNull(field) && !value.get(field).asText().isBlank()
                ? value.get(field).asText() : fallback;
    }

    private BigDecimal decimal(JsonNode value, String field) {
        try { return new BigDecimal(value.path(field).asText("0")); }
        catch (NumberFormatException exception) { return BigDecimal.ZERO; }
    }

    private String format(BigDecimal value) {
        BigDecimal normalized = value.stripTrailingZeros();
        return normalized.scale() < 0 ? normalized.setScale(0).toPlainString() : normalized.toPlainString();
    }

    private String percent(BigDecimal part, BigDecimal total) {
        if (total.compareTo(BigDecimal.ZERO) <= 0) return "0%";
        return part.divide(total, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + "%";
    }

    private String percent(long part, long total) {
        return percent(BigDecimal.valueOf(part), BigDecimal.valueOf(total));
    }

    private String dateText(Instant value) {
        return value.atZone(BUSINESS_ZONE).toLocalDate().toString();
    }
}
