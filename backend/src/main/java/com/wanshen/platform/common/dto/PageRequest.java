package com.wanshen.platform.common.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 分页请求
 */
public record PageRequest(
        @Min(value = 1, message = "页码最小为1") int page,
        @Min(value = 1, message = "每页条数最小为1") @Max(value = 100, message = "每页条数最大为100") int pageSize
) {
    public PageRequest {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 10;
        if (pageSize > 100) pageSize = 100;
    }

    public int offset() {
        return (page - 1) * pageSize;
    }
}
