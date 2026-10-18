package com.wanshen.platform.message.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = false)
public record UpdateTemplateRequest(
        @Size(max = 200) String name,
        @Size(max = 30) String category,
        @Size(max = 20) String channel,
        @Size(max = 500) String titleTemplate,
        @Size(max = 2000) String bodyTemplate,
        @Valid List<TemplateVariableInput> variables,
        @Size(max = 20) String priority,
        Boolean isActive,
        @Size(max = 500) String remark
) {
    public boolean empty() {
        return name == null && category == null && channel == null && titleTemplate == null
                && bodyTemplate == null && variables == null && priority == null
                && isActive == null && remark == null;
    }
}
