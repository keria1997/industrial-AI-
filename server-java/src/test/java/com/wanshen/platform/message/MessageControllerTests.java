package com.wanshen.platform.message;

import com.fasterxml.jackson.databind.JsonNode;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MessageControllerTests {
    private MockMvc mockMvc;
    private String token;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        TokenService tokenService = new TokenService("test-secret", new ObjectMapper());
        RequestContextService contexts = new RequestContextService(tokenService);
        mockMvc = MockMvcBuilders.standaloneSetup(new MessageController(
                new MessageStore(), contexts, objectMapper
        )).setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue("admin", "系统管理员", "超级管理员",
                List.of("TENANT-SHWS", "TENANT-HDJG"), List.of("*"),
                "development-session-v1").accessToken();
    }

    @Test
    void createsTemplateAndSendsRenderedMessage() throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/message/templates")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "template-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TPL-TEST","name":"测试模板","category":"production",
                                 "channel":"in_app","titleTemplate":"{{kind}}提醒","bodyTemplate":"{{text}}",
                                 "variables":[{"name":"kind","desc":"类型"},{"name":"text","desc":"内容"}]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("TPL-TEST"))
                .andExpect(jsonPath("$.version").value(1))
                .andReturn();
        JsonNode template = objectMapper.readTree(created.getResponse().getContentAsString());
        String templateId = template.path("id").asText();

        mockMvc.perform(post("/api/v1/message/messages")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "message-send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"templateCode":"TPL-TEST","category":"system","recipientId":"user-1",
                                 "title":"ignored","body":"ignored",
                                 "variables":{"kind":"生产","text":"订单已创建"}}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message.title").value("生产提醒"))
                .andExpect(jsonPath("$.message.body").value("订单已创建"))
                .andExpect(jsonPath("$.message.templateCode").value("TPL-TEST"));

        mockMvc.perform(patch("/api/v1/message/templates/" + templateId)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "template-update")
                        .header("If-Match", "1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"测试模板二\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("测试模板二"))
                .andExpect(jsonPath("$.version").value(2));
    }

    @Test
    void skipsMessageWhenUserPreferenceDisablesChannel() throws Exception {
        mockMvc.perform(put("/api/v1/message/preferences")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "preference-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"production\",\"channel\":\"in_app\",\"enabled\":false}"))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/message/messages")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "message-skip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"production\",\"channel\":\"in_app\",\"recipientId\":\"admin\",\"title\":\"A\",\"body\":\"B\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skipped").value(true))
                .andExpect(jsonPath("$.reason").value("user_preference_disabled"));
    }

    @Test
    void sendsBatchAndReplaysWithSameIdempotencyKey() throws Exception {
        String body = """
                {"category":"system","recipientIds":["u1","u2"],"title":"维护","body":"今晚维护"}
                """;
        for (int index = 0; index < 2; index++) {
            mockMvc.perform(post("/api/v1/message/messages/batch")
                            .header("Authorization", "Bearer " + token)
                            .header("X-Tenant-Id", "TENANT-SHWS")
                            .header("X-Idempotency-Key", "batch-send")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.sent").value(2))
                    .andExpect(jsonPath("$.skipped").value(0));
        }
    }

    @Test
    void rejectsWritesWithoutIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/v1/message/messages")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\":\"system\",\"recipientId\":\"u1\",\"title\":\"A\",\"body\":\"B\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PRODUCTION_400_INVALID_ARGUMENT"));
    }
}
