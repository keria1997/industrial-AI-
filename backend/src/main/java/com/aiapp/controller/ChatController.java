package com.aiapp.controller;

import com.aiapp.model.ApiResponse;
import com.aiapp.model.ChatRequest;
import com.aiapp.entity.ChatMessage;
import com.aiapp.entity.ChatSession;
import com.aiapp.service.ChatService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 聊天接口控制器
 *
 * 前端唯一对接入口。负责鉴权、参数校验、SSE 流式转发。
 *
 * 调用链路: frontend -> ChatController -> ChatService -> AiServiceClient -> ai-service
 */
@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    /**
     * 创建聊天会话。
     * POST /api/v1/chat/sessions
     */
    @PostMapping("/sessions")
    public ApiResponse<Map<String, String>> createSession(
            @RequestHeader("Authorization") String authHeader) {
        // 简化：生产环境应解析 JWT 获取 userId
        String userId = "anonymous";
        ChatSession session = chatService.createSession(userId);
        return ApiResponse.success(Map.of("sessionId", session.getId().toString()));
    }

    /**
     * 聊天补全（SSE 流式）。
     * POST /api/v1/chat/completions
     *
     * 调用链路: frontend SSE -> ChatController.chat -> ChatService -> AiServiceClient
     */
    @PostMapping(value = "/completions", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(120_000L); // 2 分钟超时

        // 参数校验
        if (request.getSessionId() == null || request.getMessage() == null
                || request.getMessage().isBlank()) {
            throw new IllegalArgumentException("sessionId and message are required");
        }

        // 异步处理，不阻塞 Servlet 线程
        new Thread(() -> {
            try {
                chatService.handleChat(request, emitter);
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        }).start();

        return emitter;
    }

    /**
     * 获取会话历史消息。
     * GET /api/v1/chat/sessions/{sessionId}/messages
     */
    @GetMapping("/sessions/{sessionId}/messages")
    public ApiResponse<List<ChatMessage>> getMessages(
            @PathVariable String sessionId) {
        List<ChatMessage> messages = chatService.getMessages(UUID.fromString(sessionId));
        return ApiResponse.success(messages);
    }
}

