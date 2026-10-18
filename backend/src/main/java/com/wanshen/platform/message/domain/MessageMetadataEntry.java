package com.wanshen.platform.message.domain;

public record MessageMetadataEntry(String name, String value) {
    public MessageMetadataEntry {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("metadata name is required");
        value = value == null ? "" : value;
    }
}
