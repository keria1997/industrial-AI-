package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.util.List;

/** Legacy template variables are sent as an object but stored as named bindings. */
@JsonSerialize(using = MessageVariableBindingsSerializer.class)
@JsonDeserialize(using = MessageVariableBindingsDeserializer.class)
public record MessageVariableBindings(List<MessageVariableBinding> bindings) {
    public static MessageVariableBindings empty() {
        return new MessageVariableBindings(List.of());
    }

    public MessageVariableBindings {
        bindings = bindings == null ? List.of() : List.copyOf(bindings);
    }
}
