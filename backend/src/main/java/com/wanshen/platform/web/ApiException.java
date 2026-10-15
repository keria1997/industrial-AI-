package com.wanshen.platform.web;

import java.util.List;

public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final String suggestion;
    private final List<FieldError> fieldErrors;
    private final Object details;

    public ApiException(int status, String code, String message, String suggestion) {
        this(status, code, message, suggestion, List.of(), null);
    }

    public ApiException(int status, String code, String message, String suggestion, Object details) {
        this(status, code, message, suggestion, List.of(), details);
    }

    public ApiException(
            int status,
            String code,
            String message,
            String suggestion,
            List<FieldError> fieldErrors,
            Object details
    ) {
        super(message);
        this.status = status;
        this.code = code;
        this.suggestion = suggestion;
        this.fieldErrors = fieldErrors;
        this.details = details;
    }

    public int status() { return status; }
    public String code() { return code; }
    public String suggestion() { return suggestion; }
    public List<FieldError> fieldErrors() { return fieldErrors; }
    public Object details() { return details; }

    public record FieldError(String field, String message) {}
}
