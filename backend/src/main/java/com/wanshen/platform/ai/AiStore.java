package com.wanshen.platform.ai;

import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class AiStore implements AbstractAiStore {
    private final Map<String, ModelConfig> models = new ConcurrentHashMap<>();
    private final Map<String, Conversation> conversations = new ConcurrentHashMap<>();
    private final Map<String, Message> messages = new ConcurrentHashMap<>();
    private final Map<String, Insight> insights = new ConcurrentHashMap<>();
    private final Map<String, ActionPlan> plans = new ConcurrentHashMap<>();
    private final Map<String, OutboxEvent> outbox = new ConcurrentHashMap<>();
    private final List<AuditLog> auditLogs = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();

    @Override
    public synchronized <T> T transaction(java.util.function.Supplier<T> work) { return work.get(); }

    @Override
    public List<ModelConfig> modelConfigs(String tenantId) {
        return models.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .sorted(Comparator.comparing(ModelConfig::createdAt)).toList();
    }
    @Override
    public Optional<ModelConfig> modelConfig(String tenantId, String id) {
        return Optional.ofNullable(models.get(key(tenantId, id)));
    }
    @Override
    public Optional<ModelConfig> modelConfigByCode(String tenantId, String code) {
        return models.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && item.code().equals(code)).findFirst();
    }
    @Override
    public Optional<ModelConfig> primaryModelConfig(String tenantId) {
        return models.values().stream().filter(item -> (item.tenantId().equals(tenantId)
                || "*".equals(item.tenantId())) && item.isPrimary() && item.isActive()).findFirst();
    }
    @Override
    public void saveModelConfig(ModelConfig value) { models.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteModelConfig(String tenantId, String id) { models.remove(key(tenantId, id)); }

    @Override
    public Page<Conversation> conversations(String tenantId, ConversationFilter filter) {
        List<Conversation> values = conversations.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter == null ? null : filter.userId(), item.userId()))
                .filter(item -> eq(filter == null ? null : filter.domain(), item.domain()))
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.conversationNo(), item.title(), item.userRole()))
                .sorted(createdDesc(Conversation::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Conversation> conversation(String tenantId, String id) {
        return Optional.ofNullable(conversations.get(key(tenantId, id)));
    }
    @Override
    public void saveConversation(Conversation value) { conversations.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Page<Message> messages(String tenantId, MessageFilter filter) {
        List<Message> values = messages.values().stream()
                .filter(item -> item.tenantId().equals(tenantId)
                        && item.conversationId().equals(filter.conversationId()))
                .sorted(Comparator.comparing(Message::createdAt)).collect(Collectors.toList());
        int safePage = filter == null || filter.page() == null || filter.page() < 1 ? 1 : filter.page();
        int safeSize = filter == null || filter.pageSize() == null || filter.pageSize() < 1 ? 100 : filter.pageSize();
        return page(values, safePage, safeSize);
    }
    @Override
    public void saveMessage(Message value) { messages.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void updateMessageFeedback(String tenantId, String id, boolean isHelpful, String feedback) {
        Message item = messages.get(key(tenantId, id));
        if (item == null) return;
        messages.put(key(tenantId, id), new Message(item.id(), item.tenantId(), item.conversationId(),
                item.role(), item.content(), item.intent(), item.domain(), item.tokensUsed(),
                item.latencyMs(), item.modelConfigId(), item.modelName(), item.actionPlan(),
                item.metadata(), isHelpful, feedback, item.createdAt()));
    }

    @Override
    public Page<Insight> insights(String tenantId, InsightFilter filter) {
        List<Insight> values = insights.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter == null ? null : filter.domain(), item.domain()))
                .filter(item -> eq(filter == null ? null : filter.type(), item.type()))
                .filter(item -> eq(filter == null ? null : filter.severity(), item.severity()))
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.insightNo(), item.title(), item.summary()))
                .sorted(createdDesc(Insight::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Insight> insight(String tenantId, String id) {
        return Optional.ofNullable(insights.get(key(tenantId, id)));
    }
    @Override
    public void saveInsight(Insight value) { insights.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void dismissInsight(String tenantId, String id, String dismissedBy, String dismissedAt) {
        Insight item = insights.get(key(tenantId, id));
        if (item == null) return;
        insights.put(key(tenantId, id), new Insight(item.id(), item.tenantId(), item.insightNo(),
                item.type(), item.domain(), item.severity(), item.title(), item.summary(),
                item.detail(), item.sourceType(), item.sourceId(), item.confidence(), "dismissed",
                item.expiresAt(), dismissedBy, dismissedAt, item.metadata(), item.version(),
                item.createdAt(), now(), item.createdBy()));
    }

    @Override
    public Page<ActionPlan> actionPlans(String tenantId, ActionPlanFilter filter) {
        List<ActionPlan> values = plans.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> eq(filter == null ? null : filter.conversationId(), item.conversationId()))
                .sorted(createdDesc(ActionPlan::createdAt)).collect(Collectors.toList());
        return page(values, filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<ActionPlan> actionPlan(String tenantId, String id) {
        return Optional.ofNullable(plans.get(key(tenantId, id)));
    }
    @Override
    public void saveActionPlan(ActionPlan value) { plans.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void updateActionPlanStatus(String tenantId, String id, String status, String actorId,
                                       String actorAt, String rejectedReason) {
        ActionPlan item = plans.get(key(tenantId, id));
        if (item == null) return;
        plans.put(key(tenantId, id), new ActionPlan(item.id(), item.tenantId(), item.messageId(),
                item.conversationId(), item.title(), item.description(), item.targetModule(),
                item.targetEntity(), item.targetAction(), item.parameters(), item.impactScope(),
                item.riskLevel(), item.dataEvidence(), item.approvalPath(), status,
                item.submittedBy(), item.submittedAt(), actorId, actorAt, rejectedReason,
                item.executedAt(), item.executionResult(), item.version() + 1,
                item.createdAt(), now()));
    }

    @Override
    public void addOutbox(OutboxEvent event) { outbox.put(key(event.tenantId(), event.eventId()), event); }
    @Override
    public synchronized List<OutboxEvent> pendingOutbox(String tenantId) {
        return outbox.values().stream().filter(item -> item.tenantId().equals(tenantId)
                && "PENDING".equals(item.status())).sorted(Comparator.comparing(OutboxEvent::createdAt)).toList();
    }
    @Override
    public synchronized List<String> pendingOutboxTenantIds() {
        return outbox.values().stream().filter(item -> "PENDING".equals(item.status()))
                .map(OutboxEvent::tenantId).distinct().sorted().toList();
    }
    @Override
    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        OutboxEvent item = outbox.get(key(tenantId, eventId));
        if (item == null) return;
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(), item.eventType(),
                item.aggregateType(), item.aggregateId(), item.aggregateVersion(), item.correlationId(),
                item.traceId(), item.payload(), "PUBLISHED", item.attempts(), item.lastError(), item.createdAt()));
    }
    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        OutboxEvent item = outbox.get(key(tenantId, eventId));
        if (item == null) return;
        int attempts = item.attempts() + 1;
        outbox.put(key(tenantId, eventId), new OutboxEvent(item.eventId(), item.tenantId(), item.eventType(),
                item.aggregateType(), item.aggregateId(), item.aggregateVersion(), item.correlationId(),
                item.traceId(), item.payload(), attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING",
                attempts, error == null ? item.lastError() : error, item.createdAt()));
    }
    @Override
    public void addAuditLog(AuditLog log) { auditLogs.add(log); }
    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(key(tenantId, commandType, key)));
    }
    @Override
    public void saveIdempotency(String tenantId, String commandType, String key,
                                String requestHash, int statusCode, Object body) {
        idempotency.put(key(tenantId, commandType, key),
                new IdempotencyRecord(requestHash, statusCode, body));
    }

    private <T> Comparator<T> createdDesc(java.util.function.Function<T, String> function) {
        return Comparator.comparing(function).reversed();
    }
    private boolean eq(String expected, String actual) { return expected == null || expected.equals(actual); }
    private boolean search(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        return Arrays.stream(fields).filter(Objects::nonNull)
                .anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }
    private <T> AbstractAiStore.Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new AbstractAiStore.Page<>(List.copyOf(values.subList(from, to)), values.size());
    }
    private String key(String... values) { return String.join(":", values); }
    private String now() { return java.time.Instant.now().toString(); }
}
