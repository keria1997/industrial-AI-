package com.wanshen.platform.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.wanshen.platform.storage.ModuleInfra.AuditLog;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;
import com.wanshen.platform.storage.ModuleInfra.OutboxEvent;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface AbstractAiStore {
    record Page<T>(List<T> items, int total) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ModelConfig(
            String id, String tenantId, String code, String name, String provider,
            String modelName, String apiKeyCiphertext, String apiKeyKeyId,
            String apiKeyMasked, String baseUrl, String temperature, int maxTokens,
            int timeoutSeconds, boolean isActive, boolean isPrimary, String fallbackModelId,
            Map<String, Object> metadata, String remark, int version,
            String createdAt, String updatedAt, String createdBy
    ) {}

    record Conversation(
            String id, String tenantId, String conversationNo, String userId,
            String userRole, String title, String domain, String status,
            int messageCount, Map<String, Object> metadata, int version,
            String createdAt, String updatedAt
    ) {}

    record Evidence(String label, String value) {}

    record ActionPlanData(
            String title, String description, String targetModule, String targetEntity,
            String targetAction, Map<String, Object> parameters, String impactScope,
            String riskLevel, List<Evidence> dataEvidence, String approvalPath
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Message(
            String id, String tenantId, String conversationId, String role,
            String content, String intent, String domain, int tokensUsed,
            int latencyMs, String modelConfigId, String modelName,
            ActionPlanData actionPlan, Map<String, Object> metadata,
            Boolean isHelpful, String feedback, String createdAt
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Insight(
            String id, String tenantId, String insightNo, String type, String domain,
            String severity, String title, String summary, Map<String, Object> detail,
            String sourceType, String sourceId, String confidence, String status,
            String expiresAt, String dismissedBy, String dismissedAt,
            Map<String, Object> metadata, int version, String createdAt,
            String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionPlan(
            String id, String tenantId, String messageId, String conversationId,
            String title, String description, String targetModule, String targetEntity,
            String targetAction, Map<String, Object> parameters, String impactScope,
            String riskLevel, List<Evidence> dataEvidence, String approvalPath,
            String status, String submittedBy, String submittedAt, String approvedBy,
            String approvedAt, String rejectedReason, String executedAt,
            Map<String, Object> executionResult, int version,
            String createdAt, String updatedAt
    ) {}

    record ConversationFilter(Integer page, Integer pageSize, String userId, String domain,
                              String status, String search) {}
    record MessageFilter(Integer page, Integer pageSize, String conversationId) {}
    record InsightFilter(Integer page, Integer pageSize, String domain, String type,
                         String severity, String status, String search) {}
    record ActionPlanFilter(Integer page, Integer pageSize, String status, String conversationId) {}

    <T> T transaction(java.util.function.Supplier<T> work);

    List<ModelConfig> modelConfigs(String tenantId);
    Optional<ModelConfig> modelConfig(String tenantId, String id);
    Optional<ModelConfig> modelConfigByCode(String tenantId, String code);
    Optional<ModelConfig> primaryModelConfig(String tenantId);
    void saveModelConfig(ModelConfig value);
    void deleteModelConfig(String tenantId, String id);

    Page<Conversation> conversations(String tenantId, ConversationFilter filter);
    Optional<Conversation> conversation(String tenantId, String id);
    void saveConversation(Conversation value);

    Page<Message> messages(String tenantId, MessageFilter filter);
    void saveMessage(Message value);
    void updateMessageFeedback(String tenantId, String id, boolean isHelpful, String feedback);

    Page<Insight> insights(String tenantId, InsightFilter filter);
    Optional<Insight> insight(String tenantId, String id);
    void saveInsight(Insight value);
    void dismissInsight(String tenantId, String id, String dismissedBy, String dismissedAt);

    Page<ActionPlan> actionPlans(String tenantId, ActionPlanFilter filter);
    Optional<ActionPlan> actionPlan(String tenantId, String id);
    void saveActionPlan(ActionPlan value);
    void updateActionPlanStatus(String tenantId, String id, String status, String actorId,
                                String actorAt, String rejectedReason);

    void addOutbox(OutboxEvent event);
    List<OutboxEvent> pendingOutbox(String tenantId);
    List<String> pendingOutboxTenantIds();
    void markOutboxPublished(String tenantId, String eventId);
    void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts);
    void addAuditLog(AuditLog log);
    Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key);
    void saveIdempotency(String tenantId, String commandType, String key,
                         String requestHash, int statusCode, Object body);
}
