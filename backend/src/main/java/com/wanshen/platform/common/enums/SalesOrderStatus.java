package com.wanshen.platform.common.enums;

/**
 * 销售订单状态枚举
 *
 * <p>状态机: PENDING_CONFIRMATION → CONFIRMED → REPLENISHING → PARTIALLY_SHIPPED → SHIPPED → COMPLETED
 * <br>取消: 任意未完成状态可转到 CANCELED（需校验无下游事实）
 *
 * @see com.wanshen.platform.common.enums.QuoteStatus
 */
public enum SalesOrderStatus {

    /** 待发货（初始状态，历史页面"待确认"为兼容显示） */
    PENDING_CONFIRMATION("待发货"),

    /** 已确认（发货内容已固化） */
    CONFIRMED("已确认"),

    /** 生产补货中（存在未满足的缺口生产需求） */
    REPLENISHING("生产补货中"),

    /** 部分发货（有已发量且有剩余量） */
    PARTIALLY_SHIPPED("部分发货"),

    /** 已发货（全部行 shippedQty = orderedQty） */
    SHIPPED("已发货"),

    /** 已完成（SHIPPED + 客户签收 + AR结算 + 无未关闭RMA/争议） */
    COMPLETED("已完成"),

    /** 已取消（仅待发货且无活动履约事实时允许取消） */
    CANCELED("已取消");

    private final String displayName;

    SalesOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /**
     * 判断是否为终态（不可再变更）
     */
    public boolean isTerminal() {
        return this == COMPLETED || this == CANCELED;
    }

    /**
     * 判断是否已发货或有发货
     */
    public boolean hasShipment() {
        return this == PARTIALLY_SHIPPED || this == SHIPPED || this == COMPLETED;
    }

    /**
     * 判断是否允许取消（仅待发货且未确认内容）
     */
    public boolean isCancellable() {
        return this == PENDING_CONFIRMATION;
    }
}
