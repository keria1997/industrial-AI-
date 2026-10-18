package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.util.List;

/** Named audit snapshot serialized as the legacy before/after JSON object. */
@JsonSerialize(using = MessageAuditStateSerializer.class)
@JsonDeserialize(using = MessageAuditStateDeserializer.class)
public record MessageAuditState(List<MessageAuditField> fields) {
    public static MessageAuditState empty() {
        return new MessageAuditState(List.of());
    }

    public MessageAuditState {
        fields = fields == null ? List.of() : List.copyOf(fields);
    }
}
