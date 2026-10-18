package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record CreateSubscriptionRequest(
        @NotBlank @Size(max = 200) String eventType,
        @NotBlank @Size(max = 30) String category,
        Boolean enabled
) {}
