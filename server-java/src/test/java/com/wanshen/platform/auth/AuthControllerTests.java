package com.wanshen.platform.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTests {
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
                "console", "", "http://127.0.0.1:5173", "console"
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
}
