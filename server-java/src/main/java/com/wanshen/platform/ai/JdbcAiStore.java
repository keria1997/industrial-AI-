package com.wanshen.platform.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class JdbcAiStore extends JdbcModuleStoreSupport implements AbstractAiStore {
    public JdbcAiStore(DataSource dataSource, ObjectMapper objectMapper) {
        super(dataSource, objectMapper, "ai");
    }

    @Override
    public List<ModelConfig> modelConfigs(String tenantId) {
        return documents(tenantId, "modelConfig", ModelConfig.class).stream()
                .sorted(Comparator.comparing(ModelConfig::createdAt)).toList();
    }
    @Override
    public Optional<ModelConfig> modelConfig(String tenantId, String id) {
        return document(tenantId, "modelConfig", id, ModelConfig.class);
    }
    @Override
    public Optional<ModelConfig> modelConfigByCode(String tenantId, String code) {
        return modelConfigs(tenantId).stream().filter(item -> item.code().equals(code)).findFirst();
    }
    @Override
    public Optional<ModelConfig> primaryModelConfig(String tenantId) {
        return documents(tenantId, "modelConfig", ModelConfig.class).stream()
                .filter(item -> (item.tenantId().equals(tenantId) || "*".equals(item.tenantId()))
                        && item.isPrimary() && item.isActive()).findFirst();
    }
    @Override
    public void saveModelConfig(ModelConfig value) { putDocument(value.tenantId(), "modelConfig", value.id(), value); }
    @Override
    public void deleteModelConfig(String tenantId, String id) { deleteDocument(tenantId, "modelConfig", id); }

    @Override
    public Page<Conversation> conversations(String tenantId, ConversationFilter filter) {
        return page(conversations(tenantId).stream()
                .filter(item -> eq(filter == null ? null : filter.userId(), item.userId()))
                .filter(item -> eq(filter == null ? null : filter.domain(), item.domain()))
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.conversationNo(), item.title(), item.userRole()))
                .sorted(Comparator.comparing(Conversation::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    private List<Conversation> conversations(String tenantId) {
        return documents(tenantId, "conversation", Conversation.class);
    }
    @Override
    public Optional<Conversation> conversation(String tenantId, String id) {
        return document(tenantId, "conversation", id, Conversation.class);
    }
    @Override
    public void saveConversation(Conversation value) { putDocument(value.tenantId(), "conversation", value.id(), value); }

    @Override
    public Page<Message> messages(String tenantId, MessageFilter filter) {
        List<Message> values = documents(tenantId, "message", Message.class).stream()
                .filter(item -> item.conversationId().equals(filter.conversationId()))
                .sorted(Comparator.comparing(Message::createdAt)).toList();
        int safePage = filter == null || filter.page() == null || filter.page() < 1 ? 1 : filter.page();
        int safeSize = filter == null || filter.pageSize() == null || filter.pageSize() < 1 ? 100 : filter.pageSize();
        return page(values, safePage, safeSize);
    }
    @Override
    public void saveMessage(Message value) { putDocument(value.tenantId(), "message", value.id(), value); }
    @Override
    public void updateMessageFeedback(String tenantId, String id, boolean isHelpful, String feedback) {
        document(tenantId, "message", id, Message.class).ifPresent(item -> putDocument(tenantId, "message", id,
                new Message(item.id(), item.tenantId(), item.conversationId(), item.role(), item.content(),
                        item.intent(), item.domain(), item.tokensUsed(), item.latencyMs(), item.modelConfigId(),
                        item.modelName(), item.actionPlan(), item.metadata(), isHelpful, feedback, item.createdAt())));
    }

    @Override
    public Page<Insight> insights(String tenantId, InsightFilter filter) {
        return page(documents(tenantId, "insight", Insight.class).stream()
                .filter(item -> eq(filter == null ? null : filter.domain(), item.domain()))
                .filter(item -> eq(filter == null ? null : filter.type(), item.type()))
                .filter(item -> eq(filter == null ? null : filter.severity(), item.severity()))
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.insightNo(), item.title(), item.summary()))
                .sorted(Comparator.comparing(Insight::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Insight> insight(String tenantId, String id) {
        return document(tenantId, "insight", id, Insight.class);
    }
    @Override
    public void saveInsight(Insight value) { putDocument(value.tenantId(), "insight", value.id(), value); }
    @Override
    public void dismissInsight(String tenantId, String id, String dismissedBy, String dismissedAt) {
        document(tenantId, "insight", id, Insight.class).ifPresent(item -> putDocument(tenantId, "insight", id,
                new Insight(item.id(), item.tenantId(), item.insightNo(), item.type(), item.domain(),
                        item.severity(), item.title(), item.summary(), item.detail(), item.sourceType(),
                        item.sourceId(), item.confidence(), "dismissed", item.expiresAt(), dismissedBy,
                        dismissedAt, item.metadata(), item.version(), item.createdAt(),
                        java.time.Instant.now().toString(), item.createdBy())));
    }

    @Override
    public Page<ActionPlan> actionPlans(String tenantId, ActionPlanFilter filter) {
        return page(documents(tenantId, "actionPlan", ActionPlan.class).stream()
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> eq(filter == null ? null : filter.conversationId(), item.conversationId()))
                .sorted(Comparator.comparing(ActionPlan::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<ActionPlan> actionPlan(String tenantId, String id) {
        return document(tenantId, "actionPlan", id, ActionPlan.class);
    }
    @Override
    public void saveActionPlan(ActionPlan value) { putDocument(value.tenantId(), "actionPlan", value.id(), value); }
    @Override
    public void updateActionPlanStatus(String tenantId, String id, String status, String actorId,
                                       String actorAt, String rejectedReason) {
        document(tenantId, "actionPlan", id, ActionPlan.class).ifPresent(item -> putDocument(tenantId, "actionPlan", id,
                new ActionPlan(item.id(), item.tenantId(), item.messageId(), item.conversationId(), item.title(),
                        item.description(), item.targetModule(), item.targetEntity(), item.targetAction(),
                        item.parameters(), item.impactScope(), item.riskLevel(), item.dataEvidence(),
                        item.approvalPath(), status, item.submittedBy(), item.submittedAt(), actorId, actorAt,
                        rejectedReason, item.executedAt(), item.executionResult(), item.version() + 1,
                        item.createdAt(), java.time.Instant.now().toString())));
    }

    private boolean eq(String expected, String actual) { return expected == null || expected.equals(actual); }
    private boolean search(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        return Arrays.stream(fields).filter(Objects::nonNull)
                .anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }
    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }
}
