package com.wanshen.platform.message.application.result;

import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;
import com.wanshen.platform.message.AbstractMessageStore.Subscription;
import com.wanshen.platform.message.AbstractMessageStore.Template;
import com.wanshen.platform.message.AbstractMessageStore.UserPreference;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Optional;

/** Concrete command results; each record preserves the existing JSON contract. */
public final class MessageCommandResults {
    private MessageCommandResults() {}

    public record TemplateCreated(Template template) implements MessageCommandResult<Template> {
        @Override public Template body() { return template; }
        @Override public int status() { return 201; }
        @Override public Optional<Integer> version() { return Optional.of(template.version()); }
    }

    public record TemplateUpdated(Template template) implements MessageCommandResult<Template> {
        @Override public Template body() { return template; }
        @Override public int status() { return 200; }
        @Override public Optional<Integer> version() { return Optional.of(template.version()); }
    }

    public record TemplateDeleted(boolean deleted) implements MessageCommandResult<Boolean> {
        @Override public Boolean body() { return deleted; }
        @Override public int status() { return 200; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MessageSent(MessageRecord message, Boolean skipped, String reason)
            implements MessageCommandResult<MessageSent> {
        public static MessageSent created(MessageRecord message) { return new MessageSent(message, null, null); }
        public static MessageSent skipped(String reason) { return new MessageSent(null, true, reason); }
        @Override public MessageSent body() { return this; }
        @Override public int status() { return message == null ? 200 : 201; }
        @Override public Optional<Integer> version() {
            return message == null ? Optional.empty() : Optional.of(message.version());
        }
    }

    public record MessageBatchSent(
            java.util.List<MessageRecord> messages, int sent, int skipped
    ) implements MessageCommandResult<MessageBatchSent> {
        @Override public MessageBatchSent body() { return this; }
        @Override public int status() { return 201; }
    }

    public record MessageUpdated(MessageRecord message) implements MessageCommandResult<MessageRecord> {
        @Override public MessageRecord body() { return message; }
        @Override public int status() { return 200; }
        @Override public Optional<Integer> version() { return Optional.of(message.version()); }
    }

    public record MessagesMarkedRead(int marked) implements MessageCommandResult<Integer> {
        @Override public Integer body() { return marked; }
        @Override public int status() { return 200; }
    }

    public record PreferenceSaved(UserPreference preference)
            implements MessageCommandResult<UserPreference> {
        @Override public UserPreference body() { return preference; }
        @Override public int status() { return preference.version() == 1 ? 201 : 200; }
        @Override public Optional<Integer> version() { return Optional.of(preference.version()); }
    }

    public record SubscriptionCreated(Subscription subscription)
            implements MessageCommandResult<Subscription> {
        @Override public Subscription body() { return subscription; }
        @Override public int status() { return 201; }
        @Override public Optional<Integer> version() { return Optional.of(subscription.version()); }
    }

    public record SubscriptionDeleted(boolean deleted) implements MessageCommandResult<Boolean> {
        @Override public Boolean body() { return deleted; }
        @Override public int status() { return 200; }
    }

    public record Replay<T>(MessageCommandResult<T> result) implements MessageCommandResult<T> {
        @Override public T body() { return result.body(); }
        @Override public int status() { return result.status(); }
        @Override public Optional<Integer> version() { return result.version(); }
        @Override public boolean replayed() { return true; }
    }
}
