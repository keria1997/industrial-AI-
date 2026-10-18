package com.wanshen.platform.message.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MarkAllReadRequest(@NotBlank @Size(max = 100) String recipientId) {}
