package com.wanshen.platform.message.application;

import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageVariableBindings;

import java.util.List;

/** Application-layer commands for the message use cases. */
public final class MessageCommands {
    private MessageCommands() {}

    public record MessageActor(
            String tenantId,
            String actorId,
            String traceId,
            String idempotencyKey,
            Integer expectedVersion,
            List<String> permissions
    ) {
        public boolean has(String permission) {
            return permissions.contains("*") || permissions.contains(permission);
        }
    }

    public record TemplateSearch(
            Integer page, Integer pageSize, String category, String channel,
            Boolean isActive, String search
    ) {}

    public record CreateTemplate(
            String code, String name, String category, String channel,
            String titleTemplate, String bodyTemplate,
            List<TemplateVariable> variables, String priority, String remark
    ) {}

    public record TemplateVariable(String name, String desc) {}

    public record UpdateTemplate(
            String id, String name, String category, String channel, String titleTemplate,
            String bodyTemplate, List<TemplateVariable> variables, String priority,
            Boolean isActive, String remark
    ) {
        public boolean empty() {
            return name == null && category == null && channel == null && titleTemplate == null
                    && bodyTemplate == null && variables == null && priority == null
                    && isActive == null && remark == null;
        }
    }

    public record DeleteTemplate(String id) {}

    public record MessageSearch(
            Integer page, Integer pageSize, String recipientId, String category,
            Boolean isRead, Boolean isArchived, Boolean isStarred, String priority, String search
    ) {}

    public record SendMessage(
            String templateCode, String category, String channel, String priority,
            String recipientId, String recipientName, String title, String body,
            String sourceType, String sourceId, String sourceDocNo,
            MessageMetadata metadata, MessageVariableBindings variables
    ) {}

    public record SendBatchMessage(
            String templateCode, String category, String channel, String priority,
            List<String> recipientIds, String title, String body,
            String sourceType, String sourceId, String sourceDocNo,
            MessageMetadata metadata, MessageVariableBindings variables
    ) {}

    public record MarkAllRead(String recipientId) {}
    public record AggregateStateChange(String id) {}
    public record StarMessage(String id, boolean starred) {}
    public record SavePreference(
            String category, String channel, Boolean enabled, String minPriority,
            String quietHoursStart, String quietHoursEnd
    ) {}
    public record CreateSubscription(String eventType, String category, Boolean enabled) {}
    public record DeleteSubscription(String id) {}
}
