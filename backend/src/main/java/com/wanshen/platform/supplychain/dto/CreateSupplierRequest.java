package com.wanshen.platform.supplychain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建供应商请求
 */
public record CreateSupplierRequest(
        @NotBlank(message = "供应商名称不能为空") @Size(max = 128) String name,
        @Size(max = 64) String contactPerson,
        @Size(max = 32) String contactPhone,
        @Size(max = 128) String address,
        String industry,
        String remark
) {}
