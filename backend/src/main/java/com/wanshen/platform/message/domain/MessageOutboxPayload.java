package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Payload facts emitted by the message module; unused fields depend on the event type. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MessageOutboxPayload(
        String messageId,
        String recipientId,
        String category,
        String priority,
        String templateId,
        String code
    ) {
    public static MessageOutboxPayload empty() {
        return new MessageOutboxPayload(null, null, null, null, null, null);
    }
}
