package com.wanshen.platform.ai;

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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AiControllerTests {
    private MockMvc mockMvc;
    private AiStore store;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private String token;

    @BeforeEach
    void setUp() {
        TokenService tokenService = new TokenService("test-secret", new ObjectMapper());
        RequestContextService contexts = new RequestContextService(tokenService);
        store = new AiStore();
        mockMvc = MockMvcBuilders.standaloneSetup(new AiController(store, contexts, objectMapper, null))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        token = tokenService.issue("admin", "系统管理员", "超级管理员", List.of("TENANT-SHWS"),
                List.of("*"), "development-session-v1").accessToken();
    }

    @Test
    void createsUpdatesAndReplaysModelConfig() throws Exception {
        String body = """
                {"code":"gpt-main","name":"主模型","provider":"openai",
                 "modelName":"gpt-4o-mini","apiKey":"sk-1234567890"}
                """;
        MvcResult created = mockMvc.perform(post("/api/v1/ai/models")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "model-create-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.config.apiKeyMasked").value("sk-****7890"))
                .andExpect(jsonPath("$.config.version").value(1))
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("config").path("id").asText();

        mockMvc.perform(patch("/api/v1/ai/models/" + id)
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "model-update-1")
                        .header("If-Match", "1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"生产主模型\",\"isPrimary\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.config.name").value("生产主模型"))
                .andExpect(jsonPath("$.config.isPrimary").value(true))
                .andExpect(jsonPath("$.config.version").value(2));

        mockMvc.perform(post("/api/v1/ai/models")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "model-create-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.config.id").value(id));
        assertEquals(1, store.modelConfigs("TENANT-SHWS").size());
    }

    @Test
    void chatsWithReferenceEngineAndReplaysWithoutNewMessages() throws Exception {
        String body = "{\"message\":\"创建一个生产工单\"}";
        MvcResult first = mockMvc.perform(post("/api/v1/ai/chat")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "chat-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.conversation.messageCount").value(2))
                .andExpect(jsonPath("$.assistantMessage.intent").value("action"))
                .andExpect(jsonPath("$.actionPlan.targetEntity").value("production"))
                .andReturn();
        JsonNode response = objectMapper.readTree(first.getResponse().getContentAsString());
        assertEquals(2, store.messages("TENANT-SHWS", new AbstractAiStore.MessageFilter(1, 100,
                response.path("conversation").path("id").asText())).total());

        mockMvc.perform(post("/api/v1/ai/chat")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "chat-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.conversation.id").value(response.path("conversation").path("id").asText()));
        assertEquals(1, store.conversations("TENANT-SHWS", new AbstractAiStore.ConversationFilter(
                1, 100, null, null, null, null)).total());
    }

    @Test
    void submitsAndReviewsActionPlan() throws Exception {
        String id = UUID.randomUUID().toString();
        String body = """
                {"messageId":"%s","conversationId":"%s","actionPlan":{
                  "title":"调整排产","description":"解决工单逾期","targetModule":"生产管理",
                  "targetEntity":"production","targetAction":"create","parameters":{"workOrderId":"WO-1"},
                  "impactScope":"单条工单","riskLevel":"high","dataEvidence":[{"label":"逾期","value":"2天"}],
                  "approvalPath":"生产主管审批"}}
                """.formatted(id, id);
        MvcResult created = mockMvc.perform(post("/api/v1/ai/action-plans/submit")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "plan-submit-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.actionPlan.status").value("submitted"))
                .andReturn();
        String planId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("actionPlan").path("id").asText();

        mockMvc.perform(post("/api/v1/ai/action-plans/" + planId + "/review")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS")
                        .header("X-Idempotency-Key", "plan-review-1")
                        .header("If-Match", "1")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approve\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
        assertEquals("approved", store.actionPlan("TENANT-SHWS", planId).orElseThrow().status());
        assertTrue(store.pendingOutbox("TENANT-SHWS").size() == 1);
    }

    @Test
    void analyzesProductionAndCreatesInsights() throws Exception {
        mockMvc.perform(post("/api/v1/ai/analyze-production")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Tenant-Id", "TENANT-SHWS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.anomalies.length()").value(2))
                .andExpect(jsonPath("$.predictions.length()").value(3))
                .andExpect(jsonPath("$.recommendations.length()").value(3));
        assertEquals(2, store.insights("TENANT-SHWS", new AbstractAiStore.InsightFilter(
                1, 100, null, null, null, null, null)).total());
    }
}
