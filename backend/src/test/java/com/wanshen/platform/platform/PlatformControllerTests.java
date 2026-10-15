package com.wanshen.platform.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.web.ApiExceptionHandler;
import com.wanshen.platform.web.RequestContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PlatformControllerTests {
    private MockMvc mockMvc;
    private TenantProvisioningService provisioning;
    private TokenService tokens;

    @BeforeEach
    void setUp() {
        InMemoryPlatformProvisioningStore store = new InMemoryPlatformProvisioningStore();
        provisioning = new TenantProvisioningService(store);
        provisioning.provisionBaseline(new TenantProvisioningService.Input("TENANT-SHWS", "万申", "admin", "管理员"));
        tokens = new TokenService("test-secret", new ObjectMapper());
        mockMvc = MockMvcBuilders.standaloneSetup(new PlatformController(
                new PlatformService(store), new RequestContextService(tokens), new ObjectMapper()
        )).setControllerAdvice(new ApiExceptionHandler()).build();
    }

    private String token() {
        return tokens.issue("admin", "管理员", "超级管理员", List.of("TENANT-SHWS"),
                List.of("*"), "test").accessToken();
    }

    @Test
    void exposesSnapshotAndManagedCollections() throws Exception {
        mockMvc.perform(get("/api/v1/platform/snapshot").header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenant.id").value("TENANT-SHWS"))
                .andExpect(jsonPath("$.orgUnits", hasSize(2)))
                .andExpect(jsonPath("$.permissions", hasSize(72)))
                .andExpect(jsonPath("$.permissions[?(@.code == 'production.work-order.read')]").isNotEmpty());

        mockMvc.perform(get("/api/v1/platform/org-units").header("Authorization", "Bearer " + token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void createsUpdatesAndAuditsOrgUnit() throws Exception {
        String token = token();
        String body = """
                {"id":"ORG-QA","code":"DEPT-QA","name":"质量部","type":"department","parentId":"ORG-ROOT",
                 "managerEmployeeId":"EMP-ADMIN","status":"enabled"}
                """;
        String etag = mockMvc.perform(post("/api/v1/platform/org-units")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Trace-Id", "trace-platform")
                        .contentType("application/json").content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("ETag", "\"1\""))
                .andReturn().getResponse().getHeader("ETag");

        mockMvc.perform(put("/api/v1/platform/org-units/ORG-QA")
                        .header("Authorization", "Bearer " + token)
                        .header("If-Match", etag)
                        .contentType("application/json").content(body))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", "\"2\""))
                .andExpect(jsonPath("$.name").value("质量部"));
    }

    @Test
    void savesAndReadsRoleGrants() throws Exception {
        String token = token();
        mockMvc.perform(put("/api/v1/platform/roles/ROLE-ADMIN/grants")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("""
                                {"grants":[{"permissionId":"PERM-PLATFORM","effect":"allow"}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].permissionId").value("PERM-PLATFORM"));

        mockMvc.perform(get("/api/v1/platform/roles/ROLE-ADMIN/grants").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }
}
