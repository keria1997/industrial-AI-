package com.aiapp.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * AI 服务 HTTP 客户端
 *
 * 业务后端调用 AI 服务的唯一入口。
 * 此类只做 HTTP 转发，不包含 prompt / Agent / RAG 逻辑。
 *
 * 调用链路: ChatService -> AiServiceClient -> ai-service/api/routes.py
 */
@Component
public class AiServiceClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public AiServiceClient(RestClient aiServiceRestClient, ObjectMapper objectMapper) {
        this.restClient = aiServiceRestClient;
        this.objectMapper = objectMapper;
    }

    /**
     * 调用 AI 服务流式聊天接口，将 SSE 事件转发给前端。
     *
     * 调用链路: ChatService.streamChat -> AiServiceClient.streamChat -> AI 服务 /ai/v1/chat/completions
     */
    public void streamChat(List<Map<String, String>> messages, boolean useRag, SseEmitter emitter) {
        try {
            Map<String, Object> requestBody = Map.of(
                "messages", messages,
                "use_rag", useRag
            );

            // AI 服务返回 SSE 流，逐行读取并转发
            String response = restClient.post()
                    .uri("/ai/v1/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            // 解析 SSE 格式响应，逐 chunk 转发
            // 简化处理：实际生产应使用 WebClient/WebFlux 做真正的流式转发
            if (response != null && !response.isEmpty()) {
                for (String line : response.split("\n")) {
                    if (line.startsWith("data:")) {
                        String data = line.substring(5).trim();
                        if (!data.isEmpty() && !"[DONE]".equals(data)) {
                            JsonNode node = objectMapper.readTree(data);
                            if (node.has("content")) {
                                emitter.send(SseEmitter.event()
                                        .name("delta")
                                        .data(node.get("content").asText()));
                            }
                        }
                    }
                }
            }
            emitter.send(SseEmitter.event().name("done").data(""));
        } catch (Exception e) {
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"code\":50200,\"message\":\"AI service unavailable\"}"));
            } catch (Exception ignored) {}
        }
    }
}

