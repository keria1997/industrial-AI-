package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;

public class MessageAuditStateSerializer extends JsonSerializer<MessageAuditState> {
    @Override
    public void serialize(MessageAuditState value, JsonGenerator generator, SerializerProvider provider)
            throws IOException {
        generator.writeStartObject();
        for (MessageAuditField field : value.fields()) {
            if (field.value() == null) generator.writeNullField(field.name());
            else generator.writeStringField(field.name(), field.value());
        }
        generator.writeEndObject();
    }
}
