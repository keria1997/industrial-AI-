package com.wanshen.platform.common.enums;

/**
 * 收付款方向枚举
 */
public enum PaymentDirection {

    /** 收款（客户→公司） */
    IN("收款"),

    /** 付款（公司→供应商） */
    OUT("付款");

    private final String displayName;

    PaymentDirection(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
