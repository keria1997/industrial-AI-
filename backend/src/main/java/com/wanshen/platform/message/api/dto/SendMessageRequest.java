package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageVariableBindings;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record SendMessageRequest(
        @Size(max = 100) String templateCode,
        @NotBlank @Size(max = 30) String category,
        @Size(max = 20) String channel,
        @Size(max = 20) String priority,
        @NotBlank @Size(max = 100) String recipientId,
        @Size(max = 200) String recipientName,
        @NotBlank @Size(max = 500) String title,
        @NotBlank @Size(max = 2000) String body,
        @Size(max = 100) String sourceType,
        @Size(max = 100) String sourceId,
        @Size(max = 100) String sourceDocNo,
        MessageMetadata metadata,
        MessageVariableBindings variables
) {}
