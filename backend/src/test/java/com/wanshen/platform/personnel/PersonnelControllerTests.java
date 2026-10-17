package com.wanshen.platform.personnel;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PersonnelControllerTests {
    private MockMvc mockMvc;
    private String token;

    @BeforeEach
    void setUp() {
        TokenService tokenService = new TokenService("test-secret", new ObjectMapper());
        RequestContextService contexts = new RequestContextService(tokenService);
        mockMvc = MockMvcBuilders.standaloneSetup(new PersonnelController(
                new PersonnelStore(), contexts, new ObjectMapper()
        )).setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue(
                "admin", "系统管理员", "超级管理员",
                List.of("TENANT-SHWS", "TENANT-HDJG"), List.of("*"),
                "development-session-v1"
        ).accessToken();
    }

    @Test
    void createsAndUpdatesAnEmployeeWithIdempotencyAndOptimisticLock() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/personnel/employees")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "employee-create-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "employeeNo": "EMP-JAVA-001",
                                  "name": "张三",
                                  "department": "总装",
                                  "position": "技师",
                                  "phone": "13800000000",
                                  "email": "zhang@example.com"
                                }
                                """)
                )
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.employee.employeeNo").value("EMP-JAVA-001"))
                .andExpect(jsonPath("$.employee.version").value(1))
                .andReturn();

        String id = new ObjectMapper().readTree(created.getResponse().getContentAsString())
                .path("employee").path("id").asText();

        mockMvc.perform(patch("/api/v1/personnel/employees/" + id)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "employee-update-1")
                        .header("If-Match", "1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"张三丰\"}")
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employee.name").value("张三丰"))
                .andExpect(jsonPath("$.employee.version").value(2));
    }

    @Test
    void rejectsWritesWithoutIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/v1/personnel/employees")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_400_INVALID_ARGUMENT"));
    }

    @Test
    void rejectsEmployeeWithoutRequiredFields() throws Exception {
        mockMvc.perform(post("/api/v1/personnel/employees")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "employee-invalid-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"employeeNo":"EMP-BAD","name":"王五"}
                                """)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_400_INVALID_ARGUMENT"));
    }

    @Test
    void replaysTheSameIdempotencyKeyWithoutCreatingSecondEmployee() throws Exception {
        String body = """
                {
                  "employeeNo": "EMP-JAVA-REPLAY",
                  "name": "李四",
                  "department": "质检",
                  "position": "工程师",
                  "phone": "13900000000",
                  "email": "li@example.com"
                }
                """;
        for (int index = 0; index < 2; index++) {
            mockMvc.perform(post("/api/v1/personnel/employees")
                            .header("Authorization", "Bearer " + token)
                            .header("X-Tenant-Id", "TENANT-SHWS")
                            .header("X-Idempotency-Key", "employee-replay-1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body)
                    )
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.employee.employeeNo").value("EMP-JAVA-REPLAY"));
        }
    }
}
