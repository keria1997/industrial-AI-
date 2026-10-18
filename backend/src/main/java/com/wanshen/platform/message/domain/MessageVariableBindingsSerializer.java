package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;

public class MessageVariableBindingsSerializer extends JsonSerializer<MessageVariableBindings> {
    @Override
    public void serialize(
            MessageVariableBindings value, JsonGenerator generator, SerializerProvider provider
    ) throws IOException {
        generator.writeStartObject();
        for (MessageVariableBinding binding : value.bindings()) {
            generator.writeStringField(binding.name(), binding.value());
        }
        generator.writeEndObject();
    }
}
