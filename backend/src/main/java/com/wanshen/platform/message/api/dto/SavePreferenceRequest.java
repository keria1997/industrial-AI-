package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record SavePreferenceRequest(
        @NotBlank @Size(max = 30) String category,
        @NotBlank @Size(max = 20) String channel,
        Boolean enabled,
        @Size(max = 20) String minPriority,
        @Size(max = 10) String quietHoursStart,
        @Size(max = 10) String quietHoursEnd
) {}
