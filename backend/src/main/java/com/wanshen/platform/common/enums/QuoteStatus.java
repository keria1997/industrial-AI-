package com.wanshen.platform.common.enums;

/**
 * 产品报价状态枚举
 *
 * <p>状态机: DRAFT → PENDING_APPROVAL → ACTIVE → EXPIRING → EXPIRED
 * <br>转单: ACTIVE → CONVERTED
 * <br>作废: 草稿或生效中且未转单可 VOID
 */
public enum QuoteStatus {

    /** 草稿 */
    DRAFT("草稿"),

    /** 待审批 */
    PENDING_APPROVAL("待审批"),

    /** 生效中 */
    ACTIVE("正常"),

    /** 临期（有效期即将到期） */
    EXPIRING("临期"),

    /** 已过期 */
    EXPIRED("已过期"),

    /** 已转订单 */
    CONVERTED("已转订单"),

    /** 已作废 */
    VOID("已作废");

    private final String displayName;

    QuoteStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * 判断是否为有效报价（可用于转单）
     */
    public boolean isConvertible() {
        return this == ACTIVE || this == EXPIRING;
    }

    /**
     * 判断是否为终态
     */
    public boolean isTerminal() {
        return this == EXPIRED || this == CONVERTED || this == VOID;
    }
}
