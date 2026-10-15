package com.wanshen.platform.common.dto;

import java.util.List;

/**
 * 分页响应
 *
 * @param <T> 记录类型
 */
public record PageResponse<T>(List<T> items, long total, int page, int pageSize) {

    public static <T> PageResponse<T> of(List<T> items, long total, int page, int pageSize) {
        return new PageResponse<>(items, total, page, pageSize);
    }
}
