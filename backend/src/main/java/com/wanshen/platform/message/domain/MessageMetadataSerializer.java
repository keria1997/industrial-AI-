package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;

/** Preserves the legacy JSON object shape without exposing Map in the domain. */
public class MessageMetadataSerializer extends JsonSerializer<MessageMetadata> {
    @Override
    public void serialize(MessageMetadata value, JsonGenerator generator, SerializerProvider provider)
            throws IOException {
        generator.writeStartObject();
        for (MessageMetadataEntry entry : value.entries()) {
            generator.writeStringField(entry.name(), entry.value());
        }
        generator.writeEndObject();
    }
}
