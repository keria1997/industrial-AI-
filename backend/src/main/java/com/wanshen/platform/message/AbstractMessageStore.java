package com.wanshen.platform.message;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.wanshen.platform.message.domain.MessageAuditEntry;
import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageOutboxEvent;
import com.wanshen.platform.storage.ModuleInfra.IdempotencyRecord;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

public interface AbstractMessageStore {
    public record TemplateVariable(String name, String desc) {}

    public record Template(
            String id, String tenantId, String code, String name,
            String category, String channel, String titleTemplate, String bodyTemplate,
            List<TemplateVariable> variables, String priority, boolean isActive,
            String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MessageRecord(
            String id, String tenantId, String msgNo,
            @JsonInclude(JsonInclude.Include.NON_NULL) String templateCode,
            String category, String channel, String priority, String title, String body,
            String recipientId, String recipientName, String senderId, String senderName,
            String sourceType, String sourceId, String sourceDocNo,
            boolean isRead, @JsonInclude(JsonInclude.Include.NON_NULL) String readAt,
            boolean isArchived, @JsonInclude(JsonInclude.Include.NON_NULL) String archivedAt,
            boolean isStarred, MessageMetadata metadata, String status, String errorMessage,
            @JsonInclude(JsonInclude.Include.NON_NULL) String sentAt,
            int version, String createdAt, String updatedAt
    ) {
        public MessageRecord read(String readAt, String updatedAt, int version) {
            return new MessageRecord(id, tenantId, msgNo, templateCode, category, channel, priority,
                    title, body, recipientId, recipientName, senderId, senderName, sourceType,
                    sourceId, sourceDocNo, true, readAt, isArchived, archivedAt, isStarred,
                    metadata, status, errorMessage, sentAt, version, createdAt, updatedAt);
        }

        public MessageRecord archive(String archivedAt, String updatedAt, int version) {
            return new MessageRecord(id, tenantId, msgNo, templateCode, category, channel, priority,
                    title, body, recipientId, recipientName, senderId, senderName, sourceType,
                    sourceId, sourceDocNo, isRead, readAt, true, archivedAt, isStarred,
                    metadata, status, errorMessage, sentAt, version, createdAt, updatedAt);
        }

        public MessageRecord star(boolean starred, String updatedAt, int version) {
            return new MessageRecord(id, tenantId, msgNo, templateCode, category, channel, priority,
                    title, body, recipientId, recipientName, senderId, senderName, sourceType,
                    sourceId, sourceDocNo, isRead, readAt, isArchived, archivedAt, starred,
                    metadata, status, errorMessage, sentAt, version, createdAt, updatedAt);
        }
    }

    public record UserPreference(
            String id, String tenantId, String userId, String category, String channel,
            boolean enabled, String minPriority, String quietHoursStart, String quietHoursEnd,
            int version, String createdAt, String updatedAt
    ) {}

    public record Subscription(
            String id, String tenantId, String userId, String eventType, String category,
            boolean enabled, int version, String createdAt, String updatedAt
    ) {}

    public record Page<T>(List<T> items, int total) {}

    <T> T transaction(Supplier<T> work);

    Page<Template> templates(
            String tenantId, Integer page, Integer pageSize, String category,
            String channel, Boolean isActive, String search
    );

    Optional<Template> template(String tenantId, String id);
    Optional<Template> templateByCode(String tenantId, String code);
    void saveTemplate(Template value);
    void deleteTemplate(String tenantId, String id);

    Page<MessageRecord> records(
            String tenantId, Integer page, Integer pageSize, String recipientId,
            String category, Boolean isRead, Boolean isArchived, Boolean isStarred,
            String priority, String search
    );

    Optional<MessageRecord> record(String tenantId, String id);
    void saveRecord(MessageRecord value);

    List<UserPreference> preferences(String tenantId, String userId);
    Optional<UserPreference> preference(
            String tenantId, String userId, String category, String channel
    );
    void savePreference(UserPreference value);

    List<Subscription> subscriptions(String tenantId, String userId);
    Optional<Subscription> subscription(String tenantId, String userId, String eventType);
    void saveSubscription(Subscription value);
    void deleteSubscription(String tenantId, String id);

    void addOutbox(MessageOutboxEvent event);
    List<MessageOutboxEvent> pendingOutbox(String tenantId);
    List<String> pendingOutboxTenantIds();
    void markOutboxPublished(String tenantId, String eventId);
    void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts);
    void addAuditLog(MessageAuditEntry log);
    Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key);
    void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    );
}
