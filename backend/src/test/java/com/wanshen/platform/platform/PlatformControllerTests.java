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
                .andExpect(jsonPath("$.permissions", hasSize(71)))
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

    @Test
    void createsSingleRoleAccountAndRejectsDuplicateEmployeeBinding() throws Exception {
        String token = token();
        mockMvc.perform(post("/api/v1/platform/employees")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("""
                                {"id":"EMP-I035","employeeNo":"E035","name":"单角色员工",
                                 "primaryOrgId":"ORG-ROOT","mobile":"13800000000",
                                 "email":"e035@example.test","status":"active"}
                                """))
                .andExpect(status().isCreated());

        String accountBody = """
                {"loginName":"single-role","employeeId":"EMP-I035","roleId":"ROLE-SALE",
                 "authType":"password","status":"enabled"}
                """;
        mockMvc.perform(post("/api/v1/platform/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(accountBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roleId").value("ROLE-SALE"))
                .andExpect(jsonPath("$.directRoleIds").doesNotExist());

        mockMvc.perform(post("/api/v1/platform/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content(accountBody.replace("single-role", "second-login")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PLATFORM_409_EMPLOYEE_ACCOUNT_EXISTS"));

        mockMvc.perform(post("/api/v1/platform/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json").content("""
                                {"loginName":"legacy-multi-role","employeeId":"EMP-ADMIN",
                                 "directRoleIds":["ROLE-SALE","ROLE-FIN"],"authType":"password",
                                 "status":"enabled"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void filtersAndValidatesTenantDictionaries() throws Exception {
        String token = token();
        mockMvc.perform(get("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("category", "组织类型"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].code").value("company"))
                .andExpect(jsonPath("$[1].code").value("department"));

        String equipmentType = """
                {"category":"equipment_type","code":"smt","name":"贴片加工设备",
                 "status":"enabled","sortOrder":10}
                """;
        String healthStatus = """
                {"category":"equipment_health_status","code":"running","name":"运行正常",
                 "status":"enabled","sortOrder":10}
                """;
        mockMvc.perform(post("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType("application/json").content(equipmentType))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sortOrder").value(10));
        mockMvc.perform(post("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType("application/json").content(healthStatus))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("equipment_health_status"));

        mockMvc.perform(get("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .param("category", "equipment_type")
                        .param("status", "enabled"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("贴片加工设备"));

        mockMvc.perform(post("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType("application/json").content(equipmentType))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PLATFORM_409_DICTIONARY_DUPLICATE"));

        mockMvc.perform(post("/api/v1/platform/dictionaries")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType("application/json").content("""
                                {"category":"equipment_type","code":"invalid code!","name":"非法编码",
                                 "status":"enabled"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PLATFORM_400_INVALID_DICTIONARY"));
    }
}
