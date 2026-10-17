package com.wanshen.platform.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTests {
    private String token(List<String> permissions) {
        return new TokenService("test-secret", new ObjectMapper()).issue("test01", "管理员", "老板",
                List.of("TENANT-SHWS", "TENANT-HDJG"), permissions, "test").accessToken();
    }

    @Test void provisionsSelectedTenantOnceForAnAuthorizedAdministrator() throws Exception {
        for (boolean created : List.of(true, false)) {
            mockMvc.perform(post("/api/v1/platform/tenants/self-provision")
                            .header("Authorization", "Bearer " + token(List.of("*")))
                            .header("X-Tenant-Id", "TENANT-HDJG"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.created").value(created))
                    .andExpect(jsonPath("$.tenantId").value("TENANT-HDJG"));
        }
    }

    @Test void rejectsBootstrapFromUnprivilegedOrForeignTenantSessions() throws Exception {
        mockMvc.perform(post("/api/v1/platform/tenants/self-provision")
                        .header("Authorization", "Bearer " + token(List.of("production.mps.view")))
                        .header("X-Tenant-Id", "TENANT-SHWS")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/platform/tenants/self-provision")
                        .header("Authorization", "Bearer " + token(List.of("*")))
                        .header("X-Tenant-Id", "OTHER")).andExpect(status().isForbidden());
    }
    private MockMvc mockMvc;

    private CaptchaService captchaService;

    @BeforeEach
    void setUp() {
        captchaService = new CaptchaService();
        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(
                new InMemoryRegisteredUserStore(),
                captchaService,
                new PasswordHasher(),
                new TokenService("test-secret", new ObjectMapper()),
                new com.wanshen.platform.platform.TenantProvisioningService(
                        new com.wanshen.platform.platform.InMemoryPlatformProvisioningStore()),
                true,
                "test01,reviewer,operator,inspector",
                "123456",
                "console", "", "http://127.0.0.1:5173", (phone, code) -> new SmsSender.Delivery("", true)
        )).setControllerAdvice(new com.wanshen.platform.web.ApiExceptionHandler()).build();
    }

    @Test
    void issuesSignedSessionAfterOneTimeCaptcha() throws Exception {
        CaptchaService.Challenge challenge = captchaService.generate();
        mockMvc.perform(post("/api/v1/session/captcha"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.captchaId").isNotEmpty())
                .andExpect(jsonPath("$.image").value(org.hamcrest.Matchers.startsWith(
                        "data:image/svg+xml;charset=utf-8,")))
                .andExpect(jsonPath("$.expiresIn").isNumber());

        mockMvc.perform(post("/api/v1/session/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "account": "test01",
                                  "password": "123456",
                                  "captchaId": "%s",
                                  "captchaCode": "%s"
                                }
                                """.formatted(challenge.id(), challenge.code()))
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.account").value("test01"))
                .andExpect(jsonPath("$.user.tenantIds[0]").value("TENANT-SHWS"));
    }


    @Test
    void rejectsInvalidLoginWithoutConsumingUnknownChallenge() throws Exception {
        mockMvc.perform(post("/api/v1/session/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "account": "test01",
                                  "password": "123456",
                                  "captchaId": "not-a-captcha",
                                  "captchaCode": "AAAA"
                                }
                                """)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_400_INVALID_ARGUMENT"))
                .andExpect(jsonPath("$.error.message").value("图形验证码错误或已过期"));
    }

    @Test
    void locksRegisteredAccountAfterFivePasswordFailures() {
        InMemoryRegisteredUserStore users = new InMemoryRegisteredUserStore();
        users.createUser(new RegisteredUserStore.CreateUserInput(
                "locked-user", "encoded", "Locked", "13800000001", "locked@example.com",
                null, "Lock Ltd", "制造", true, null, null, null, null
        ));
        for (int index = 0; index < 4; index++) users.registerLoginFailure("locked-user");
        org.junit.jupiter.api.Assertions.assertFalse(users.isLoginLocked("locked-user"));
        users.registerLoginFailure("locked-user");
        org.junit.jupiter.api.Assertions.assertTrue(users.isLoginLocked("locked-user"));
        users.resetLoginFailures("locked-user");
        org.junit.jupiter.api.Assertions.assertFalse(users.isLoginLocked("locked-user"));
    }
}
