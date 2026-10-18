package com.wanshen.platform.web;

import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.LinkedHashMap;
import java.util.List;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> handle(ApiException exception, HttpServletRequest request) {
        String traceId = request.getHeader("X-Trace-Id");
        if (traceId == null || traceId.isBlank()) traceId = request.getRequestId();

        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", exception.code());
        error.put("message", exception.getMessage());
        error.put("suggestion", exception.suggestion());
        error.put("retryable", false);
        error.put("fieldErrors", exception.fieldErrors());
        error.put("details", exception.details());
        error.put("traceId", traceId);

        return ResponseEntity.status(exception.status())
                .header("X-Trace-Id", traceId)
                .body(Map.of("error", error));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleInvalidArgument(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<ApiException.FieldError> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiException.FieldError(error.getField(), error.getDefaultMessage()))
                .toList();
        ApiException normalized = new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT",
                "请求字段不符合规则", "检查请求字段后重试", fieldErrors, null);
        return handle(normalized, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> handleUnreadableBody(HttpMessageNotReadableException exception, HttpServletRequest request) {
        String message = exception.getCause() instanceof InvalidFormatException
                ? "请求字段类型不合法" : "请求体不是合法 JSON";
        return handle(new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message,
                "检查请求字段后重试"), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleUnexpected(Exception exception, HttpServletRequest request) {
        String traceId = request.getHeader("X-Trace-Id");
        if (traceId == null || traceId.isBlank()) traceId = request.getRequestId();
        log.error("Unhandled API exception {} {}", request.getMethod(), request.getRequestURI(), exception);

        return ResponseEntity.internalServerError()
                .header("X-Trace-Id", traceId)
                .body(Map.of("error", Map.of(
                        "code", "INTERNAL_ERROR",
                        "message", "服务暂时不可用",
                        "suggestion", "请稍后重试；若持续失败，请提供页面上的追踪 ID",
                        "retryable", true,
                        "traceId", traceId
                )));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResource() {
        return ResponseEntity.notFound().build();
    }
}
