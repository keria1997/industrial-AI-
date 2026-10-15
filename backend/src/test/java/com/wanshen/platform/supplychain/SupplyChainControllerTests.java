package com.wanshen.platform.supplychain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SupplyChainControllerTests {
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private SupplyChainStore store;
    private String token;

    @BeforeEach
    void setUp() {
        TokenService tokenService = new TokenService("test-secret", new ObjectMapper());
        RequestContextService contexts = new RequestContextService(tokenService);
        store = new SupplyChainStore();
        mockMvc = MockMvcBuilders.standaloneSetup(new SupplyChainController(store, contexts, objectMapper))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue("admin", "系统管理员", "超级管理员", List.of("TENANT-SHWS"),
                List.of("*"), "development-session-v1").accessToken();
    }

    @Test
    void createsUpdatesAndReplaysSupplier() throws Exception {
        String body = """
                {"supplierNo":"SUP-JAVA-001","name":"上海供应商","rating":"A",
                 "riskLevel":"低","metadata":{"region":"华东"}}
                """;
        MvcResult created = mockMvc.perform(post("/api/v1/supply-chain/suppliers")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "supplier-create-1")
                        .header("X-Trace-Id", "trace-supplier")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.supplier.supplierNo").value("SUP-JAVA-001"))
                .andExpect(jsonPath("$.supplier.version").value(1))
                .andExpect(jsonPath("$.supplier.rating").value("A"))
                .andReturn();
        assertEquals("\"1\"", created.getResponse().getHeader("ETag"));

        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("supplier").path("id").asText();
        mockMvc.perform(patch("/api/v1/supply-chain/suppliers/" + id)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "supplier-update-1")
                        .header("If-Match", "1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"上海一级供应商\",\"status\":\"suspended\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.supplier.name").value("上海一级供应商"))
                .andExpect(jsonPath("$.supplier.status").value("suspended"))
                .andExpect(jsonPath("$.supplier.version").value(2));

        MvcResult replay = mockMvc.perform(post("/api/v1/supply-chain/suppliers")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "supplier-create-1")
                        .header("X-Trace-Id", "trace-replay")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.supplier.supplierNo").value("SUP-JAVA-001"))
                .andReturn();
        assertEquals("true", replay.getResponse().getHeader("X-Idempotent-Replay"));
    }

    @Test
    void resolvesRiskAndDrainsOutbox() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/supply-chain/risk-events")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "risk-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"companyName":"上海客户","companyType":"customer",
                                 "riskType":"经营异常","riskLevel":"中风险"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.riskEvent.status").value("active"))
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("riskEvent").path("id").asText();

        mockMvc.perform(post("/api/v1/supply-chain/risk-events/" + id + "/resolve")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "risk-resolve-1")
                        .header("If-Match", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.riskEvent.status").value("resolved"))
                .andExpect(jsonPath("$.riskEvent.version").value(2));

        assertEquals(2, new SupplyChainOutboxWorker(store, "TENANT-SHWS", false, 5)
                .drain("TENANT-SHWS").published());
        assertTrue(store.pendingOutbox("TENANT-SHWS").isEmpty());
    }

    @Test
    void rejectsUpdateWithoutExpectedVersion() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/supply-chain/customers")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "customer-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerNo\":\"CUS-JAVA-001\",\"name\":\"上海客户\"}"))
                .andExpect(status().isCreated()).andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("customer").path("id").asText();

        mockMvc.perform(patch("/api/v1/supply-chain/customers/" + id)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "customer-update-missing")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"新名称\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_409_VERSION_CONFLICT"))
                .andExpect(jsonPath("$.error.message").value("缺少聚合版本"));
    }
}
