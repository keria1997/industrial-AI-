package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import com.wanshen.platform.message.domain.MessageMetadata;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = false)
public record CreateTemplateRequest(
        @NotBlank @Size(max = 100) String code,
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 30) String category,
        @NotBlank @Size(max = 20) String channel,
        @NotBlank @Size(max = 500) String titleTemplate,
        @NotBlank @Size(max = 2000) String bodyTemplate,
        @Valid List<TemplateVariableInput> variables,
        @Size(max = 20) String priority,
        @Size(max = 500) String remark
) {}
