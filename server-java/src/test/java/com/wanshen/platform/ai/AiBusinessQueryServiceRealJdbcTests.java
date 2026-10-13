package com.wanshen.platform.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "JAVA_JDBC_URL", matches = ".+")
class AiBusinessQueryServiceRealJdbcTests {
    private static final String JDBC_URL = System.getenv("JAVA_JDBC_URL");
    private static HikariDataSource dataSource;
    private static AiBusinessQueryService service;

    @BeforeAll
    static void setUp() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(JDBC_URL);
        config.setMaximumPoolSize(1);
        dataSource = new HikariDataSource(config);
        service = new AiBusinessQueryService(dataSource, new ObjectMapper());
    }

    @AfterAll
    static void tearDown() {
        if (dataSource != null) dataSource.close();
    }

    @Test
    void answersQuickPromptsFromTenantBusinessData() {
        List<String> prompts = List.of(
                "低库存物料查询", "缺料风险", "安全水位", "库存账龄", "呆滞料识别",
                "订单状态查询", "发货进度跟进", "待确认订单", "客户档案",
                "工单状态", "排产计划", "报工进度", "完工入库", "FQC检验通过率",
                "PR/PO状态", "供应商交期预警", "到货跟踪", "延迟风险"
        );
        prompts.forEach(prompt -> {
            String answer = service.answer(prompt, "TENANT-SHWS").orElseThrow();
            assertNotNull(answer);
            assertFalse(answer.isBlank(), prompt + " returned a blank answer");
            assertFalse(answer.contains("NL2SQL"), prompt + " used the template fallback");
        });
        String lowStock = service.answer("低库存物料查询", "TENANT-SHWS").orElseThrow();
        assertTrue(lowStock.contains("数据来源：业务数据库"));
    }
}
