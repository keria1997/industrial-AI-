package com.wanshen.platform.message.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TemplateVariableInput(
        @NotBlank @Size(max = 50) String name,
        @Size(max = 200) String desc
) {}
