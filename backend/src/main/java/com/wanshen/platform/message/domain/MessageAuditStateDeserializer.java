package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class MessageAuditStateDeserializer extends JsonDeserializer<MessageAuditState> {
    @Override
    public MessageAuditState deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        List<MessageAuditField> fields = new ArrayList<>();
        while (parser.nextToken() != null && !parser.currentToken().isStructEnd()) {
            String name = parser.currentName();
            parser.nextToken();
            fields.add(new MessageAuditField(name, parser.getValueAsString()));
        }
        return new MessageAuditState(fields);
    }
}
