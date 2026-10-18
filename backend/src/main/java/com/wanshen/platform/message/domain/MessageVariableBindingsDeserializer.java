package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class MessageVariableBindingsDeserializer extends JsonDeserializer<MessageVariableBindings> {
    @Override
    public MessageVariableBindings deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        List<MessageVariableBinding> bindings = new ArrayList<>();
        while (parser.nextToken() != null && !parser.currentToken().isStructEnd()) {
            String name = parser.currentName();
            parser.nextToken();
            if (!parser.currentToken().isScalarValue()) throw new IllegalArgumentException("variables 不合法");
            bindings.add(new MessageVariableBinding(name, parser.getValueAsString()));
        }
        return new MessageVariableBindings(bindings);
    }
}
