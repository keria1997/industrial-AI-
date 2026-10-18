package com.wanshen.platform.message.domain;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** Accepts the legacy metadata object and normalizes scalar values to stable text facts. */
public class MessageMetadataDeserializer extends JsonDeserializer<MessageMetadata> {
    @Override
    public MessageMetadata deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        List<MessageMetadataEntry> entries = new ArrayList<>();
        while (parser.nextToken() != null && !parser.currentToken().isStructEnd()) {
            String name = parser.currentName();
            parser.nextToken();
            entries.add(new MessageMetadataEntry(name, scalarText(parser)));
        }
        return new MessageMetadata(entries);
    }

    private String scalarText(JsonParser parser) throws IOException {
        return switch (parser.currentToken()) {
            case VALUE_STRING -> parser.getText();
            case VALUE_NUMBER_INT, VALUE_NUMBER_FLOAT -> parser.getDecimalValue().stripTrailingZeros().toPlainString();
            case VALUE_TRUE -> Boolean.TRUE.toString();
            case VALUE_FALSE -> Boolean.FALSE.toString();
            case VALUE_NULL -> "";
            default -> throw new IllegalArgumentException("metadata 只支持基础类型");
        };
    }
}
