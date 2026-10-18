package com.wanshen.platform.message.api.dto;

import jakarta.validation.constraints.NotNull;

public record StarMessageRequest(@NotNull Boolean starred) {}
