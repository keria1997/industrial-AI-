package com.wanshen.platform.common.dto;

/**
 * 统一 API 响应包装
 *
 * <p>所有接口的响应体统一使用此结构，错误码规范见 docs/api-contract.md。
 *
 * @param <T> 业务数据类型
 */
public record ApiResponse<T>(int code, String message, T data) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(0, "success", data);
    }

    public static ApiResponse<Void> success() {
        return new ApiResponse<>(0, "success", null);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
