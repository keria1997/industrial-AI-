package com.wanshen.platform.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.wanshen.platform.ai.AbstractAiStore.*;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import org.springframework.beans.factory.annotation.Autowired;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

@RestController
@RequestMapping("/api/v1/ai")
@ConditionalOnProperty(value = "app.ai.native-enabled", havingValue = "true")
public class AiController {
    private static final Set<String> PROVIDERS = Set.of("openai", "anthropic", "azure", "local", "custom");
    private static final Set<String> DOMAINS = Set.of("inventory", "sales", "production", "procurement", "finance", "general");
    private static final Set<String> INSIGHT_TYPES = Set.of("anomaly", "prediction", "recommendation", "optimization", "alert");
    private static final Set<String> SEVERITIES = Set.of("critical", "warning", "info", "success");
    private static final Set<String> INSIGHT_STATUSES = Set.of("active", "dismissed", "expired", "applied");
    private static final Set<String> RISK_LEVELS = Set.of("low", "medium", "high", "critical");

    private final AbstractAiStore store;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;
    private final AiBusinessQueryService businessQueries;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    public AiController(AbstractAiStore store, RequestContextService contexts, ObjectMapper objectMapper,
                        @Autowired(required = false) AiBusinessQueryService businessQueries) {
        this.store = store;
        this.contexts = contexts;
        this.objectMapper = objectMapper;
        this.businessQueries = businessQueries;
    }

    @GetMapping("/models")
    public List<ModelConfig> models(HttpServletRequest request) {
        RequestContext context = require(request, "ai.model.read");
        return store.modelConfigs(context.tenantId());
    }

    @GetMapping("/models/{id}")
    public ResponseEntity<ModelConfig> model(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "ai.model.read");
        validateUuid(id);
        ModelConfig value = getModel(context.tenantId(), id);
        return ResponseEntity.ok().eTag(quoted(value.version())).body(value);
    }

    @PostMapping("/models")
    public ResponseEntity<?> createModel(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.model.create");
        validateModel(input, false);
        String code = text(input, "code");
        return command(context, "ai.model.create", input, () -> {
            if (store.modelConfigByCode(context.tenantId(), code).isPresent()) {
                throw conflict("模型编码已存在", "使用不同编码");
            }
            String apiKey = optionalText(input, "apiKey", "");
            String id = UUID.randomUUID().toString();
            String now = now();
            ModelConfig value = new ModelConfig(id, context.tenantId(), code, text(input, "name"),
                    text(input, "provider"), text(input, "modelName"), apiKey, "local-development-v1",
                    maskKey(apiKey), optionalText(input, "baseUrl", ""), optionalText(input, "temperature", "0.30"),
                    intValue(input, "maxTokens", 2048), intValue(input, "timeoutSeconds", 15), true,
                    boolValue(input, "isPrimary", false), null, map(input, "metadata"),
                    optionalText(input, "remark", ""), 1, now, now, context.actorId());
            store.saveModelConfig(value);
            audit(context, "ModelConfig", id, 1, "CREATE", null, value);
            return new Command(Map.of("config", value), 201);
        });
    }

    @PatchMapping("/models/{id}")
    public ResponseEntity<?> updateModel(@PathVariable String id, @RequestBody JsonNode patch,
                                         HttpServletRequest request) {
        RequestContext context = require(request, "ai.model.update");
        validateUuid(id);
        validateModel(patch, true);
        return command(context, "ai.model.update", Map.of("id", id, "patch", patch), () -> {
            ModelConfig current = getModel(context.tenantId(), id);
            requireVersion(context, current.version());
            ModelConfig updated = new ModelConfig(current.id(), current.tenantId(), current.code(),
                    patchText(patch, "name", current.name()), patchText(patch, "provider", current.provider()),
                    patchText(patch, "modelName", current.modelName()), patchText(patch, "apiKey", current.apiKeyCiphertext()),
                    current.apiKeyKeyId(), patch.has("apiKey") ? maskKey(patch.get("apiKey").asText()) : current.apiKeyMasked(),
                    patchText(patch, "baseUrl", current.baseUrl()), patchText(patch, "temperature", current.temperature()),
                    patchInt(patch, "maxTokens", current.maxTokens()), patchInt(patch, "timeoutSeconds", current.timeoutSeconds()),
                    patchBool(patch, "isActive", current.isActive()), patchBool(patch, "isPrimary", current.isPrimary()),
                    patch.hasNonNull("fallbackModelId") ? patch.get("fallbackModelId").asText() : current.fallbackModelId(),
                    patch.has("metadata") ? map(patch, "metadata") : current.metadata(),
                    patchText(patch, "remark", current.remark()), current.version() + 1,
                    current.createdAt(), now(), current.createdBy());
            store.saveModelConfig(updated);
            audit(context, "ModelConfig", id, updated.version(), "UPDATE", current, updated);
            return new Command(Map.of("config", updated), 200);
        });
    }

    @DeleteMapping("/models/{id}")
    public ResponseEntity<?> deleteModel(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "ai.model.delete");
        validateUuid(id);
        return command(context, "ai.model.delete", Map.of("id", id), () -> {
            ModelConfig current = getModel(context.tenantId(), id);
            requireVersion(context, current.version());
            store.deleteModelConfig(context.tenantId(), id);
            audit(context, "ModelConfig", id, current.version(), "DELETE", current, null);
            return new Command(Map.of("deleted", true), 200);
        });
    }

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.chat");
        validateChat(input);
        return command(context, "ai.chat", input, () -> new Command(chat(context, input), 201));
    }

    @PostMapping("/map-columns")
    public Map<String, Object> mapColumns(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.import.use");
        validateMapColumns(input);
        ModelConfig model = store.primaryModelConfig(context.tenantId()).orElse(null);
        if (model == null || model.apiKeyCiphertext().isBlank() || !model.isActive()) {
            return Map.of("source", "unavailable", "mapping", Map.of());
        }
        try {
            String system = "你是一个数据导入助手。用户上传了一个 CSV 文件，需要将其列映射到系统的 " + text(input, "entityType")
                    + " 字段。请分析 CSV 列名和数据样例，返回一个 JSON 对象，key 为系统字段名，value 为 CSV 列名。只返回 JSON，不要有其他文字。如果某个字段在 CSV 中找不到对应的列，不要包含在 JSON 中。";
            String user = "系统字段列表：" + objectMapper.writeValueAsString(input.get("fields"))
                    + "\nCSV 列名：" + objectMapper.writeValueAsString(input.get("csvHeaders"))
                    + "\nCSV 数据样例（前 3 行）：" + objectMapper.writeValueAsString(input.get("sampleRows"));
            LlmResult result = complete(model, system, user, "0", 1024, 15);
            return Map.of("source", "llm", "mapping", objectMapper.readValue(result.content(), new TypeReference<Map<String, Object>>() {}));
        } catch (Exception ignored) {
            return Map.of("source", "unavailable", "mapping", Map.of());
        }
    }

    @GetMapping("/conversations")
    public Page<Conversation> conversations(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String domain, @RequestParam(required = false) String status,
            @RequestParam(required = false) String search
    ) {
        RequestContext context = require(request, "ai.chat");
        validatePage(page, pageSize);
        enumValue(domain, DOMAINS, "domain");
        enumValue(status, Set.of("active", "archived", "deleted"), "status");
        return store.conversations(context.tenantId(), new ConversationFilter(page, pageSize, null, domain, status, search));
    }

    @GetMapping("/conversations/{id}")
    public ResponseEntity<Conversation> conversation(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "ai.chat");
        validateUuid(id);
        Conversation value = store.conversation(context.tenantId(), id)
                .orElseThrow(() -> notFound("对话不存在", "刷新后重试"));
        return ResponseEntity.ok().eTag(quoted(value.version())).body(value);
    }

    @GetMapping("/messages")
    public Page<Message> messages(
            HttpServletRequest request,
            @RequestParam String conversationId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize
    ) {
        RequestContext context = require(request, "ai.chat");
        validateUuid(conversationId);
        validatePage(page, pageSize);
        return store.messages(context.tenantId(), new MessageFilter(page, pageSize, conversationId));
    }

    @PostMapping("/messages/{id}/feedback")
    public ResponseEntity<?> feedback(@PathVariable String id, @RequestBody JsonNode input,
                                      HttpServletRequest request) {
        RequestContext context = require(request, "ai.chat");
        validateUuid(id);
        if (!input.hasNonNull("isHelpful") || !input.get("isHelpful").isBoolean()) {
            throw bad("isHelpful 不合法", "检查请求字段后重试");
        }
        optionalTextMax(input, "feedback", 1000, "feedback");
        boolean helpful = input.get("isHelpful").asBoolean();
        String content = input.hasNonNull("feedback") ? input.get("feedback").asText() : "";
        return command(context, "ai.feedback", Map.of("id", id, "isHelpful", helpful, "feedback", content), () -> {
            store.updateMessageFeedback(context.tenantId(), id, helpful, content);
            audit(context, "AIMessage", id, 1, "FEEDBACK", null,
                    Map.of("isHelpful", helpful, "feedback", content));
            return new Command(Map.of("updated", true), 200);
        });
    }

    @PostMapping("/nl2sql")
    public Map<String, Object> nl2sql(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.nl2sql");
        if (!input.hasNonNull("query") || input.get("query").asText().isBlank()
                || input.get("query").asText().length() > 2000) throw bad("query 不合法", "检查请求字段后重试");
        return generateSql(input.get("query").asText());
    }

    @PostMapping("/analyze-production")
    public Map<String, Object> analyzeProduction(HttpServletRequest request) {
        RequestContext context = require(request, "ai.analysis");
        Map<String, Object> result = productionAnalysis();
        @SuppressWarnings("unchecked") List<Map<String, Object>> anomalies =
                (List<Map<String, Object>>) result.get("anomalies");
        for (Map<String, Object> anomaly : anomalies) {
            String now = now();
            store.saveInsight(new Insight(UUID.randomUUID().toString(), context.tenantId(), insightNo(),
                    "anomaly", "production", String.valueOf(anomaly.get("severity")),
                    anomaly.get("productName") + " - " + anomaly.get("type"),
                    String.valueOf(anomaly.get("detail")),
                    Map.of("productId", anomaly.get("productId"), "productName", anomaly.get("productName"),
                            "type", anomaly.get("type")),
                    "production_analysis", "", "85", "active", null, "", null,
                    Map.of(), 1, now, now, "ai-system"));
        }
        return result;
    }

    @GetMapping("/insights")
    public Page<Insight> insights(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize, @RequestParam(required = false) String domain,
            @RequestParam(required = false) String type, @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status, @RequestParam(required = false) String search
    ) {
        RequestContext context = require(request, "ai.insight.read");
        validatePage(page, pageSize);
        enumValue(domain, DOMAINS, "domain");
        enumValue(type, INSIGHT_TYPES, "type");
        enumValue(severity, SEVERITIES, "severity");
        enumValue(status, INSIGHT_STATUSES, "status");
        return store.insights(context.tenantId(), new InsightFilter(page, pageSize, domain, type, severity, status, search));
    }

    @GetMapping("/insights/{id}")
    public ResponseEntity<Insight> insight(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "ai.insight.read");
        validateUuid(id);
        Insight value = store.insight(context.tenantId(), id)
                .orElseThrow(() -> notFound("AI 洞察不存在", "刷新后重试"));
        return ResponseEntity.ok().eTag(quoted(value.version())).body(value);
    }

    @PostMapping("/insights")
    public ResponseEntity<?> createInsight(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.insight.create");
        validateInsight(input, false);
        return command(context, "ai.insight.create", input, () -> {
            String now = now();
            String id = UUID.randomUUID().toString();
            Insight value = new Insight(id, context.tenantId(), insightNo(), text(input, "type"),
                    text(input, "domain"), text(input, "severity"), text(input, "title"), text(input, "summary"),
                    map(input, "detail"), optionalText(input, "sourceType", ""), optionalText(input, "sourceId", ""),
                    optionalText(input, "confidence", "0"), "active", optionalText(input, "expiresAt", null),
                    "", null, map(input, "metadata"), 1, now, now, context.actorId());
            store.saveInsight(value);
            audit(context, "Insight", id, 1, "CREATE", null, value);
            return new Command(Map.of("insight", value), 201);
        });
    }

    @PostMapping("/insights/{id}/dismiss")
    public ResponseEntity<?> dismissInsight(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = require(request, "ai.insight.update");
        validateUuid(id);
        return command(context, "ai.insight.dismiss", Map.of("id", id), () -> {
            Insight current = store.insight(context.tenantId(), id)
                    .orElseThrow(() -> notFound("AI 洞察不存在", "刷新后重试"));
            requireVersion(context, current.version());
            store.dismissInsight(context.tenantId(), id, context.actorId(), now());
            audit(context, "Insight", id, current.version(), "DISMISS", current, null);
            return new Command(Map.of("dismissed", true), 200);
        });
    }

    @GetMapping("/action-plans")
    public Page<ActionPlan> actionPlans(
            HttpServletRequest request, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize, @RequestParam(required = false) String status,
            @RequestParam(required = false) String conversationId
    ) {
        RequestContext context = require(request, "ai.action.read");
        validatePage(page, pageSize);
        enumValue(status, Set.of("draft", "submitted", "approved", "rejected", "executed", "cancelled"), "status");
        if (conversationId != null) validateUuid(conversationId);
        return store.actionPlans(context.tenantId(), new ActionPlanFilter(page, pageSize, status, conversationId));
    }

    @PostMapping("/action-plans/submit")
    public ResponseEntity<?> submitActionPlan(@RequestBody JsonNode input, HttpServletRequest request) {
        RequestContext context = require(request, "ai.action.submit");
        validateUuid(text(input, "messageId"));
        validateUuid(text(input, "conversationId"));
        JsonNode planNode = input.get("actionPlan");
        validateActionPlanData(planNode);
        return command(context, "ai.action.submit", input, () -> {
            String now = now();
            String id = UUID.randomUUID().toString();
            ActionPlanData data = actionPlanData(planNode);
            ActionPlan value = new ActionPlan(id, context.tenantId(), text(input, "messageId"),
                    text(input, "conversationId"), data.title(), data.description(), data.targetModule(),
                    data.targetEntity(), data.targetAction(), data.parameters(), data.impactScope(),
                    data.riskLevel(), data.dataEvidence(), data.approvalPath(), "submitted",
                    context.actorId(), now, "", null, "", null, null, 1, now, now);
            store.saveActionPlan(value);
            audit(context, "ActionPlan", id, 1, "SUBMIT", null, value);
            outbox(context, "ai.action.submitted.v1", "ActionPlan", id, 1,
                    Map.of("planId", id, "targetModule", value.targetModule()));
            return new Command(Map.of("actionPlan", value), 201);
        });
    }

    @PostMapping("/action-plans/{id}/review")
    public ResponseEntity<?> reviewActionPlan(@PathVariable String id, @RequestBody JsonNode input,
                                              HttpServletRequest request) {
        RequestContext context = require(request, "ai.action.review");
        validateUuid(id);
        if (!input.hasNonNull("decision") || !Set.of("approve", "reject").contains(input.get("decision").asText())) {
            throw bad("decision 不合法", "检查请求字段后重试");
        }
        optionalTextMax(input, "reason", 500, "reason");
        String decision = input.get("decision").asText();
        String reason = input.hasNonNull("reason") ? input.get("reason").asText() : "";
        return command(context, "ai.action.review", Map.of("id", id, "decision", decision, "reason", reason), () -> {
            ActionPlan current = store.actionPlan(context.tenantId(), id)
                    .orElseThrow(() -> notFound("操作方案不存在", "刷新后重试"));
            requireVersion(context, current.version());
            if (!"submitted".equals(current.status())) throw conflict("操作方案当前状态不可审核", "刷新后重试");
            String status = "approve".equals(decision) ? "approved" : "rejected";
            store.updateActionPlanStatus(context.tenantId(), id, status, context.actorId(), now(), reason);
            audit(context, "ActionPlan", id, current.version() + 1, decision.toUpperCase(), current, Map.of("status", status));
            return new Command(Map.of("actionPlanId", id, "status", status), 200);
        });
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        RequestContext context = require(request, "ai.dashboard");
        Page<Conversation> conversations = store.conversations(context.tenantId(),
                new ConversationFilter(1, 1000, null, null, null, null));
        Page<Insight> insights = store.insights(context.tenantId(),
                new InsightFilter(1, 1000, null, null, null, "active", null));
        Page<ActionPlan> plans = store.actionPlans(context.tenantId(), new ActionPlanFilter(1, 1000, null, null));
        Map<String, Long> bySeverity = new LinkedHashMap<>();
        insights.items().forEach(item -> bySeverity.merge(item.severity(), 1L, Long::sum));
        return Map.of("totalConversations", conversations.total(),
                "totalMessages", conversations.items().stream().mapToInt(Conversation::messageCount).sum(),
                "activeInsights", insights.total(),
                "criticalAlerts", insights.items().stream().filter(item -> "critical".equals(item.severity())).count(),
                "pendingActionPlans", plans.items().stream().filter(item -> "submitted".equals(item.status())).count(),
                "executedActionPlans", plans.items().stream().filter(item -> "executed".equals(item.status())).count(),
                "messagesByDomain", Map.of(), "insightsBySeverity", bySeverity,
                "recentInsights", insights.items().stream().limit(10).toList());
    }

    private Map<String, Object> chat(RequestContext context, JsonNode input) {
        String message = text(input, "message");
        String domain = input.hasNonNull("domain") ? text(input, "domain") : detectDomain(message);
        String intent = detectIntent(message);
        String now = now();
        Conversation conversation;
        if (input.hasNonNull("conversationId")) {
            Conversation existing = store.conversation(context.tenantId(), text(input, "conversationId"))
                    .orElseThrow(() -> notFound("对话不存在", "刷新后重试"));
            conversation = new Conversation(existing.id(), existing.tenantId(), existing.conversationNo(),
                    existing.userId(), existing.userRole(), existing.title(), existing.domain(), existing.status(),
                    existing.messageCount() + 2, existing.metadata(), existing.version() + 1,
                    existing.createdAt(), now);
        } else {
            conversation = new Conversation(UUID.randomUUID().toString(), context.tenantId(), conversationNo(),
                    context.actorId(), "", truncate(message, 50), domain, "active", 2, Map.of(), 1, now, now);
        }
        store.saveConversation(conversation);
        Message userMessage = new Message(UUID.randomUUID().toString(), context.tenantId(), conversation.id(),
                "user", message, intent, domain, 0, 0, null, "", null, map(input, "context"),
                null, "", now);
        store.saveMessage(userMessage);
        Optional<String> databaseAnswer = businessQueries == null
                ? Optional.empty() : businessQueries.answer(message, context.tenantId());
        String[] reply = databaseAnswer
                .<String[]>map(value -> new String[]{value, ""})
                .orElseGet(() -> referenceReply(message, domain, intent));
        String usedModel = databaseAnswer.isPresent() ? "business-database" : "reference-ai";
        int tokens = Math.max(1, (int) Math.ceil(reply[0].length() / 4.0));
        ModelConfig model = store.primaryModelConfig(context.tenantId()).orElse(null);
        if (model != null && !model.apiKeyCiphertext().isBlank() && model.isActive()) {
            try {
                String system = "你是一个工业 ERP 系统的 AI 助手，服务于" + ("general".equals(domain) ? "企业管理" : domain + "管理")
                        + "场景。请根据用户的问题提供专业、简洁、可执行的分析和建议。用中文回答。";
                LlmResult result = complete(model, system, message, model.temperature(), model.maxTokens(), model.timeoutSeconds());
                reply[0] = result.content();
                reply[1] = "";
                usedModel = result.modelName();
                tokens = result.tokensUsed();
            } catch (Exception ignored) {
            }
        }
        ActionPlanData actionPlan = reply[1].isEmpty() ? null : referenceActionPlan(message, domain, intent);
        Message assistant = new Message(UUID.randomUUID().toString(), context.tenantId(), conversation.id(),
                "assistant", reply[0], intent, domain, tokens, 0, model == null ? null : model.id(),
                usedModel, actionPlan,
                databaseAnswer.isPresent() ? Map.of("dataSource", "business-database") : Map.of(),
                null, "", now());
        store.saveMessage(assistant);
        audit(context, "Conversation", conversation.id(), conversation.version(), "CHAT", null,
                Map.of("messageId", assistant.id()));
        outbox(context, "ai.message.created.v1", "AIMessage", assistant.id(), 1,
                Map.of("conversationId", conversation.id(), "intent", intent, "domain", domain));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("conversation", conversation);
        body.put("userMessage", userMessage);
        body.put("assistantMessage", assistant);
        if (actionPlan != null) body.put("actionPlan", actionPlan);
        return body;
    }

    private Map<String, Object> productionAnalysis() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("anomalies", List.of(
                Map.of("productId", "FG001", "productName", "工业AI主控板", "type", "schedule_delay",
                        "severity", "warning", "detail", "工单 WO-2026-105 实际报工耗时超出标准定额 22%，逾期概率 85%"),
                Map.of("productId", "RM201", "productName", "AI算力芯片", "type", "material_shortage",
                        "severity", "critical", "detail", "安全库存 500 件，当前可用量 120 件，缺口 380 件")));
        result.put("predictions", List.of(
                Map.of("metric", "月度产量", "currentValue", "12,400", "predictedValue", "14,800", "trend", "上升", "confidence", "87%"),
                Map.of("metric", "设备OEE", "currentValue", "78.5%", "predictedValue", "82.0%", "trend", "上升", "confidence", "82%"),
                Map.of("metric", "逾期工单数", "currentValue", "3", "predictedValue", "1", "trend", "下降", "confidence", "75%")));
        result.put("recommendations", List.of(
                Map.of("title", "调整 RM201 采购计划", "description", "AI算力芯片库存缺口 380 件，建议立即发起紧急采购申请", "priority", "high", "expectedImpact", "消除物料瓶颈，保障 2 条工单按期完工"),
                Map.of("title", "优化 WO-2026-105 排程", "description", "当前工单进度滞后，建议调用 APS 重新排产或转移至备用产线", "priority", "high", "expectedImpact", "将逾期概率从 85% 降至 30% 以下"),
                Map.of("title", "提升设备维护频次", "description", "OEE 预测下降趋势已扭转，建议维持当前预防性维护策略", "priority", "low", "expectedImpact", "持续保持设备稼动率在 80% 以上")));
        return result;
    }

    private Map<String, Object> generateSql(String query) {
        String lower = query.toLowerCase();
        String domain = detectDomain(query);
        if ("sales".equals(domain) || lower.contains("订单") || lower.contains("order")) {
            return Map.of("sql", "SELECT order_no, customer_name, overall_status, created_at FROM sales_order WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20",
                    "explanation", "查询最近 20 条销售订单基本信息", "tables", List.of("sales_order"));
        }
        if ("inventory".equals(domain) || lower.contains("库存") || lower.contains("stock")) {
            return Map.of("sql", "SELECT warehouse_id, product_id, qualified_on_hand_qty, fulfillable_qty, uom FROM inv_availability_projection WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 20",
                    "explanation", "查询库存可用量投影，包括在手持量和可履约量", "tables", List.of("inv_availability_projection"));
        }
        if ("production".equals(domain) || lower.contains("生产") || lower.contains("工单") || lower.contains("work")) {
            return Map.of("sql", "SELECT code, product_id, status, planned_qty, completed_qty FROM prod_work_order WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20",
                    "explanation", "查询最近 20 条工单的状态和完成进度", "tables", List.of("prod_work_order"));
        }
        if ("finance".equals(domain) || lower.contains("财务") || lower.contains("应收") || lower.contains("应付")) {
            return Map.of("sql", "SELECT 'AR' as type, doc_no, title, total_amount, outstanding_amount, status FROM fin_receivable WHERE tenant_id = $1 UNION ALL SELECT 'AP', doc_no, title, total_amount, outstanding_amount, status FROM fin_payable WHERE tenant_id = $1 ORDER BY status LIMIT 20",
                    "explanation", "查询应收应付账款汇总，包括未结余额", "tables", List.of("fin_receivable", "fin_payable"));
        }
        return Map.of("sql", "SELECT 1", "explanation", "无法识别查询意图，请提供更具体的业务问题", "tables", List.of());
    }

    private String detectIntent(String value) {
        String lower = value.toLowerCase();
        if (lower.matches(".*(预测|推演|趋势|forecast|predict|what.?if|沙盘).*")) return "prediction";
        if (lower.matches(".*(查询|多少|统计|汇总|列表|how many|query|count|sum|total).*")) return "query";
        if (lower.matches(".*(创建|生成|提交|审批|执行|调整|调拨|create|submit|approve|execute|adjust).*")) return "action";
        if (lower.matches(".*(分析|归因|原因|异常|偏差|analyze|root cause|anomaly|variance).*")) return "analysis";
        return "general";
    }

    private String detectDomain(String value) {
        String lower = value.toLowerCase();
        if (lower.matches(".*(库存|仓库|物料|stock|inventory|warehouse).*")) return "inventory";
        if (lower.matches(".*(销售|订单|客户|sales|order|customer).*")) return "sales";
        if (lower.matches(".*(生产|工单|排产|报工|production|work order|schedule).*")) return "production";
        if (lower.matches(".*(采购|供应商|procurement|purchase|supplier).*")) return "procurement";
        if (lower.matches(".*(财务|应收|应付|成本|finance|payment|cost).*")) return "finance";
        return "general";
    }

    private String[] referenceReply(String text, String domain, String intent) {
        if ((text.toLowerCase().matches(".*(导入|上传|批量|文件|格式|csv|excel|xlsx).*"))
                && text.matches(".*(什么|哪些|支持|格式|类型|怎么|如何).*")) {
            return new String[] {"当前系统支持以下数据文件导入：\n\n**支持的文件格式**：CSV（UTF-8 编码）\n\n**支持导入的数据类型**：\n- 仓库（编码、名称、类型、地址、负责人等）\n- 产品（编码、名称、规格、单位、安全库存等）\n- 物料（编码、名称、规格、单位、安全库存等）\n- WMS库存快照（仓库、产品、现存量、预留、冻结、可履约量、单位、事实版本、快照时间）\n\n点击 AI 助手底部的上传按钮即可选择文件。系统会自动识别列名并建议映射关系，你可以在导入前调整。\n暂不支持 Excel（.xlsx）直接导入，请先另存为 CSV 格式。", ""};
        }
        String label = domainLabel(domain);
        return switch (intent) {
            case "query" -> new String[] {"根据" + label + "数据分析，已为您检索相关信息。当前查询涉及\"" + truncate(text, 50) + "...\"，建议通过 NL2SQL 接口获取精确结果。", ""};
            case "prediction" -> new String[] {"基于历史" + label + "数据趋势分析，预测结果如下：当前指标处于正常波动区间，建议持续关注关键变量变化。如需更精确的预测，请提供更多业务参数。", ""};
            case "action" -> new String[] {"已识别到您需要执行" + label + "相关操作。AI 已生成操作建议方案，请确认后提交审批。", "action"};
            case "analysis" -> new String[] {"针对\"" + truncate(text, 50) + "...\"的归因分析：\n1. 表现层：当前指标偏差在可控范围内\n2. 业务层：受近期" + label + "波动影响\n3. 根因层：建议关注供应链稳定性与需求预测准确性\n\n建议采取预防性措施，持续监控关键指标。", ""};
            default -> new String[] {"收到您的问题。我是工业 AI 助手，可以帮您查询" + label + "数据、分析异常原因、预测趋势和执行业务操作。请告诉我您需要什么帮助。", ""};
        };
    }

    private ActionPlanData referenceActionPlan(String text, String domain, String intent) {
        String label = domainLabel(domain);
        return new ActionPlanData("AI 建议操作 - " + label,
                "基于您的问题\"" + truncate(text, 60) + "\",AI 分析后建议执行以下操作",
                "general".equals(domain) ? "生产管理" : label + "管理", domain, "create",
                Map.of("sourceText", text, "domain", domain, "intent", intent),
                "当前租户范围内单条记录操作", "low",
                List.of(new Evidence("分析域", label), new Evidence("意图类型", intent),
                        new Evidence("数据来源", "业务实时数据"), new Evidence("建议置信度", "85%")),
                "直接执行 → 操作审计 → 结果回写");
    }

    private LlmResult complete(ModelConfig model, String system, String user, String temperature,
                               int maxTokens, int timeoutSeconds) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", model.modelName());
        payload.put("messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user)));
        payload.put("temperature", temperature == null || temperature.isBlank() ? 0.3 : Double.parseDouble(temperature));
        payload.put("max_tokens", maxTokens);
        HttpRequest request = HttpRequest.newBuilder(URI.create(model.baseUrl().replaceAll("/+$", "") + "/chat/completions"))
                .timeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)))
                .header("Content-Type", "application/json").header("Authorization", "Bearer " + model.apiKeyCiphertext())
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload))).build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IllegalStateException("LLM API 返回 " + response.statusCode());
        JsonNode body = objectMapper.readTree(response.body());
        String content = body.path("choices").path(0).path("message").path("content").asText("");
        int tokens = body.path("usage").path("total_tokens").asInt(Math.max(1, content.length() / 4));
        return new LlmResult(content, body.path("model").asText(model.modelName()), tokens);
    }

    private ResponseEntity<?> command(RequestContext context, String type, Object input,
                                      java.util.function.Supplier<Command> work) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw bad("写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
        }
        String hash = hash(input);
        return store.transaction(() -> {
            Optional<IdempotencyRecord> replay = store.idempotency(context.tenantId(), type, context.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT", "幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                ResponseEntity.BodyBuilder builder = ResponseEntity.status(replay.get().statusCode())
                        .header("X-Trace-Id", context.traceId()).header("X-Idempotent-Replay", "true");
                Integer version = version(replay.get().body());
                if (version != null) builder = builder.eTag(quoted(version));
                return builder.body(replay.get().body());
            }
            Command result = work.get();
            store.saveIdempotency(context.tenantId(), type, context.idempotencyKey(), hash,
                    result.status(), result.body());
            ResponseEntity.BodyBuilder builder = ResponseEntity.status(result.status())
                    .header("X-Trace-Id", context.traceId());
            Integer version = version(result.body());
            if (version != null) builder = builder.eTag(quoted(version));
            return builder.body(result.body());
        });
    }

    private Integer version(Object body) {
        if (!(body instanceof Map<?, ?> map)) return null;
        Object value = map.containsKey("config") ? map.get("config") : map.containsKey("conversation") ? map.get("conversation")
                : map.containsKey("message") ? map.get("message") : map.containsKey("insight") ? map.get("insight")
                : map.containsKey("actionPlan") ? map.get("actionPlan") : map.containsKey("chat") ? map.get("chat") : null;
        if (value instanceof ModelConfig item) return item.version();
        if (value instanceof Conversation item) return item.version();
        if (value instanceof Insight item) return item.version();
        if (value instanceof ActionPlan item) return item.version();
        return null;
    }

    private void validateModel(JsonNode input, boolean patch) {
        if (!patch) {
            requireText(input, "code", 100, "code");
            requireText(input, "name", 200, "name");
            requireEnum(input, "provider", PROVIDERS, "provider");
            requireText(input, "modelName", 200, "modelName");
        } else if (!input.isObject() || input.isEmpty()) {
            throw bad("至少提供一个更新字段", "检查请求字段后重试");
        } else {
            optionalEnum(input, "provider", PROVIDERS, "provider");
            optionalInt(input, "maxTokens", 1, 32000, "maxTokens");
            optionalInt(input, "timeoutSeconds", 1, 300, "timeoutSeconds");
            if (input.hasNonNull("fallbackModelId")) validateUuid(text(input, "fallbackModelId"));
        }
        optionalTextMax(input, "apiKey", 500, "apiKey");
        optionalTextMax(input, "baseUrl", 500, "baseUrl");
        optionalTextMax(input, "temperature", 10, "temperature");
        optionalTextMax(input, "remark", 500, "remark");
        if (input.has("metadata") && !input.get("metadata").isObject()) throw bad("metadata 不合法", "检查请求字段后重试");
    }

    private void validateChat(JsonNode input) {
        requireText(input, "message", 4000, "message");
        if (input.hasNonNull("conversationId")) validateUuid(text(input, "conversationId"));
        optionalEnum(input, "domain", DOMAINS, "domain");
        if (input.has("context") && !input.get("context").isObject()) throw bad("context 不合法", "检查请求字段后重试");
    }

    private void validateMapColumns(JsonNode input) {
        if (!input.get("fields").isArray() || input.get("fields").size() > 50
                || !input.get("csvHeaders").isArray() || input.get("csvHeaders").isEmpty()
                || input.get("csvHeaders").size() > 100 || !input.get("sampleRows").isArray()
                || input.get("sampleRows").size() > 5 || !input.hasNonNull("entityType")) {
            throw bad("列映射请求不合法", "检查请求字段后重试");
        }
    }

    private void validateInsight(JsonNode input, boolean patch) {
        if (!patch) {
            requireEnum(input, "type", INSIGHT_TYPES, "type");
            requireEnum(input, "domain", DOMAINS, "domain");
            requireEnum(input, "severity", SEVERITIES, "severity");
            requireText(input, "title", 200, "title");
            requireText(input, "summary", 1000, "summary");
            if (input.hasNonNull("expiresAt")) {
                try { Instant.parse(text(input, "expiresAt")); } catch (DateTimeParseException exception) {
                    throw bad("expiresAt 不合法", "检查请求字段后重试");
                }
            }
        } else if (!input.isObject() || input.isEmpty()) {
            throw bad("至少提供一个更新字段", "检查请求字段后重试");
        }
        if (input.has("metadata") && !input.get("metadata").isObject()) throw bad("metadata 不合法", "检查请求字段后重试");
    }

    private void validateActionPlanData(JsonNode input) {
        requireText(input, "title", 200, "title");
        requireText(input, "description", 2000, "description");
        requireText(input, "targetModule", 100, "targetModule");
        requireText(input, "targetEntity", 100, "targetEntity");
        requireText(input, "targetAction", 100, "targetAction");
        if (!input.get("parameters").isObject()) throw bad("parameters 不合法", "检查请求字段后重试");
        requireText(input, "impactScope", 500, "impactScope");
        requireEnum(input, "riskLevel", RISK_LEVELS, "riskLevel");
        if (!input.get("dataEvidence").isArray()) throw bad("dataEvidence 不合法", "检查请求字段后重试");
        requireText(input, "approvalPath", 500, "approvalPath");
    }

    private ActionPlanData actionPlanData(JsonNode input) {
        List<Evidence> evidence = new ArrayList<>();
        input.get("dataEvidence").forEach(item -> evidence.add(new Evidence(item.path("label").asText(), item.path("value").asText())));
        return new ActionPlanData(text(input, "title"), text(input, "description"), text(input, "targetModule"),
                text(input, "targetEntity"), text(input, "targetAction"), map(input, "parameters"),
                text(input, "impactScope"), text(input, "riskLevel"), evidence, text(input, "approvalPath"));
    }

    private void requireVersion(RequestContext context, int actual) {
        if (context.expectedVersion() == null) {
            throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "缺少聚合版本",
                    "刷新数据并携带最新 If-Match 后重试", List.of(), Map.of("actualVersion", actual));
        }
        if (context.expectedVersion() != actual) {
            throw new ApiException(409, "PRODUCTION_409_VERSION_CONFLICT", "数据已被其他操作更新",
                    "刷新数据后重新确认操作", List.of(), Map.of("expectedVersion", context.expectedVersion(), "actualVersion", actual));
        }
    }

    private RequestContext require(HttpServletRequest request, String permission) {
        RequestContext context = contexts.from(request);
        if (!context.has(permission)) throw forbidden(permission);
        return context;
    }
    private void validatePage(Integer page, Integer pageSize) {
        if (page != null && page < 1) throw bad("页码必须大于等于 1", "检查请求字段后重试");
        if (pageSize != null && (pageSize < 1 || pageSize > 200)) throw bad("每页数量必须在 1-200 之间", "检查请求字段后重试");
    }
    private ModelConfig getModel(String tenantId, String id) {
        return store.modelConfig(tenantId, id).orElseThrow(() -> notFound("模型配置不存在", "刷新列表后重试"));
    }
    private void audit(RequestContext context, String aggregateType, String aggregateId, int version,
                       String action, Object before, Object after) {
        store.addAuditLog(new AuditLog(UUID.randomUUID().toString(), context.tenantId(), aggregateType,
                aggregateId, version, action, context.actorId(), before, after, UUID.randomUUID().toString(),
                context.traceId(), now()));
    }
    private void outbox(RequestContext context, String type, String aggregateType, String aggregateId,
                        int version, Map<String, Object> payload) {
        store.addOutbox(new OutboxEvent(UUID.randomUUID().toString(), context.tenantId(), type, aggregateType,
                aggregateId, version, UUID.randomUUID().toString(), context.traceId(), payload, "PENDING",
                0, "", now()));
    }
    private String maskKey(String value) { return value == null || value.isEmpty() ? "" : value.substring(0, Math.min(3, value.length())) + "****" + value.substring(Math.max(0, value.length() - Math.min(4, value.length()))); }
    private String truncate(String value, int length) { return value.length() <= length ? value : value.substring(0, length); }
    private String domainLabel(String domain) { return switch (domain) { case "inventory" -> "库存"; case "sales" -> "销售"; case "production" -> "生产"; case "procurement" -> "采购"; case "finance" -> "财务"; default -> "综合"; }; }
    private String conversationNo() { return "CONV-" + datePart() + "-" + randomPart(); }
    private String insightNo() { return "INS-" + datePart() + "-" + randomPart(); }
    private String datePart() { return LocalDate.now().toString().replace("-", ""); }
    private String randomPart() { return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(); }
    private String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(value)));
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
    private void enumValue(String value, Set<String> values, String field) {
        if (value != null && !values.contains(value)) throw bad(field + " 不合法", "检查请求字段后重试");
    }
    private void requireEnum(JsonNode input, String field, Set<String> values, String fieldName) {
        if (!input.hasNonNull(field) || !values.contains(input.get(field).asText())) throw bad(fieldName + " 不合法", "检查请求字段后重试");
    }
    private void optionalEnum(JsonNode input, String field, Set<String> values, String fieldName) {
        if (input.hasNonNull(field) && !values.contains(input.get(field).asText())) throw bad(fieldName + " 不合法", "检查请求字段后重试");
    }
    private void requireText(JsonNode input, String field, int maxLength, String fieldName) {
        if (!input.hasNonNull(field)) throw bad(fieldName + " 不合法", "检查请求字段后重试");
        if (input.get(field).asText().isBlank() || input.get(field).asText().length() > maxLength) throw bad(fieldName + " 不合法", "检查请求字段后重试");
    }
    private void optionalTextMax(JsonNode input, String field, int maxLength, String fieldName) {
        if (input.hasNonNull(field) && input.get(field).asText().length() > maxLength) throw bad(fieldName + " 不合法", "检查请求字段后重试");
    }
    private void optionalInt(JsonNode input, String field, int min, int max, String fieldName) {
        if (input.has(field) && (!input.get(field).isInt() || input.get(field).asInt() < min || input.get(field).asInt() > max)) {
            throw bad(fieldName + " 不合法", "检查请求字段后重试");
        }
    }
    private Map<String, Object> map(JsonNode input, String field) {
        if (!input.hasNonNull(field)) return Map.of();
        return objectMapper.convertValue(input.get(field), new TypeReference<Map<String, Object>>() {});
    }
    private String text(JsonNode input, String field) { return input.get(field).asText(); }
    private String optionalText(JsonNode input, String field, String fallback) { return input.hasNonNull(field) ? input.get(field).asText() : fallback; }
    private int intValue(JsonNode input, String field, int fallback) { return input.hasNonNull(field) ? input.get(field).asInt() : fallback; }
    private boolean boolValue(JsonNode input, String field, boolean fallback) { return input.hasNonNull(field) ? input.get(field).asBoolean() : fallback; }
    private String patchText(JsonNode patch, String field, String fallback) { return patch.has(field) ? patch.get(field).asText() : fallback; }
    private int patchInt(JsonNode patch, String field, int fallback) { return patch.has(field) ? patch.get(field).asInt() : fallback; }
    private boolean patchBool(JsonNode patch, String field, boolean fallback) { return patch.has(field) ? patch.get(field).asBoolean() : fallback; }
    private String quoted(Object value) { return "\"" + value + "\""; }
    private void validateUuid(String value) { try { UUID.fromString(value); } catch (RuntimeException exception) { throw bad("ID 必须是 UUID", "检查请求字段后重试"); } }
    private ApiException bad(String message, String suggestion) { return new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, suggestion); }
    private ApiException conflict(String message, String suggestion) { return new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion); }
    private ApiException forbidden(String permission) { return new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "缺少操作权限：" + permission, "请联系管理员授予对应 AI 权限"); }
    private ApiException notFound(String message, String suggestion) { return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion); }
    private String now() { return Instant.now().toString(); }
    private record Command(Object body, int status) {}
    private record LlmResult(String content, String modelName, int tokensUsed) {}
}
