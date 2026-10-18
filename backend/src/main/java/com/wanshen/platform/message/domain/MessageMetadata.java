package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.util.List;

/** Named message metadata persisted as JSONB while remaining schema-safe inside the module. */
@JsonSerialize(using = MessageMetadataSerializer.class)
@JsonDeserialize(using = MessageMetadataDeserializer.class)
public record MessageMetadata(List<MessageMetadataEntry> entries) {
    public static MessageMetadata empty() {
        return new MessageMetadata(List.of());
    }

    public MessageMetadata {
        entries = entries == null ? List.of() : List.copyOf(entries);
    }
}
