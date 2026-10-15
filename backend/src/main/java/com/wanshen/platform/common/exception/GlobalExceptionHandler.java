package com.wanshen.platform.common.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.wanshen.platform.web.ApiException;

import java.util.Map;

/**
 * 全局异常处理器
 *
 * <p>统一所有 Controller 的异常响应格式，避免每个 Controller 重复 try-catch。
 * <p>响应格式与前端 {@code ApiError} 类型对齐。
 *
 * <pre>{@code
 * {
 *   "error": {
 *     "code": "SALES_400_VALIDATION",
 *     "message": "参数校验失败",
 *     "suggestion": "检查输入后重试",
 *     "retryable": false,
 *     "fieldErrors": [],
 *     "traceId": "..."
 *   }
 * }
 * }</pre>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 业务异常（ApiException 由各 Controller/Service 主动抛出）
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
        log.warn("业务异常: code={}, message={}", ex.code(), ex.getMessage());
        return ResponseEntity
                .status(ex.status())
                .body(Map.of(
                        "error", Map.of(
                                "code", ex.code(),
                                "message", ex.getMessage(),
                                "suggestion", ex.suggestion() != null ? ex.suggestion() : "",
                                "retryable", false,
                                "fieldErrors", ex.fieldErrors() != null ? ex.fieldErrors() : java.util.List.of()
                        )
                ));
    }

    /**
     * 参数校验异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("参数异常: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(Map.of(
                        "error", Map.of(
                                "code", "COMMON_400_INVALID_ARGUMENT",
                                "message", ex.getMessage(),
                                "suggestion", "检查输入参数后重试",
                                "retryable", false
                        )
                ));
    }

    /**
     * 资源不存在
     */
    @ExceptionHandler(java.util.NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(java.util.NoSuchElementException ex) {
        log.warn("资源不存在: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(Map.of(
                        "error", Map.of(
                                "code", "COMMON_404_NOT_FOUND",
                                "message", ex.getMessage() != null ? ex.getMessage() : "资源不存在",
                                "suggestion", "确认单据编号是否正确",
                                "retryable", false
                        )
                ));
    }

    /**
     * 未预期的系统异常（兜底，不应在正常流程出现）
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        log.error("系统异常: {}", ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                        "error", Map.of(
                                "code", "COMMON_500_INTERNAL",
                                "message", "服务器内部错误",
                                "suggestion", "请联系管理员或稍后重试",
                                "retryable", true
                        )
                ));
    }
}
