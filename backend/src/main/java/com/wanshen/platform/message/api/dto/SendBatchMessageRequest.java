package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import com.wanshen.platform.message.domain.MessageMetadata;
import com.wanshen.platform.message.domain.MessageVariableBindings;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = false)
public record SendBatchMessageRequest(
        @Size(max = 100) String templateCode,
        @NotBlank @Size(max = 30) String category,
        @Size(max = 20) String channel,
        @Size(max = 20) String priority,
        @NotEmpty @Size(max = 500) List<@NotBlank @Size(max = 100) String> recipientIds,
        @NotBlank @Size(max = 500) String title,
        @NotBlank @Size(max = 2000) String body,
        @Size(max = 100) String sourceType,
        @Size(max = 100) String sourceId,
        @Size(max = 100) String sourceDocNo,
        MessageMetadata metadata,
        MessageVariableBindings variables
) {}
