package com.wanshen.platform;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 业务操作日志工具
 *
 * 输出到独立的 business.log 文件，记录核心业务事件（创建/审批/发货/核销等）。
 * 调用方式: BusinessLogUtil.info("模块名", "操作", "单据号", "关键信息");
 */
public final class BusinessLogUtil {

    private static final Logger bizLog = LoggerFactory.getLogger("com.wanshen.platform.BUSINESS");

    private BusinessLogUtil() {}

    /**
     * 记录业务操作日志
     *
     * @param module   业务模块（如"销售管理"）
     * @param action   操作类型（如"创建订单"）
     * @param docNo    单据编号（如"SO-2026-001"）
     * @param detail   补充信息
     */
    public static void info(String module, String action, String docNo, String detail) {
        bizLog.info("[{}] {} | 单据: {} | {}", module, action, docNo, detail);
    }

    public static void warn(String module, String action, String docNo, String detail) {
        bizLog.warn("[{}] {} | 单据: {} | {}", module, action, docNo, detail);
    }

    public static void error(String module, String action, String docNo, String detail) {
        bizLog.error("[{}] {} | 单据: {} | {}", module, action, docNo, detail);
    }
}
