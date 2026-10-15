package com.aiapp.service;

import com.aiapp.entity.ChatMessage;
import com.aiapp.entity.ChatSession;
import com.aiapp.model.ChatRequest;
import com.aiapp.repository.ChatMessageRepository;
import com.aiapp.repository.ChatSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 聊天业务逻辑
 *
 * 负责会话管理、消息持久化、调用 AI 服务。
 * 禁止在此类编写 prompt 字符串或 AI 逻辑。
 *
 * 调用链路: ChatController -> ChatService -> AiServiceClient -> ai-service
 */
@Service
public class ChatService {

    private final ChatSessionRepository sessionRepo;
    private final ChatMessageRepository messageRepo;
    private final AiServiceClient aiClient;

    public ChatService(ChatSessionRepository sessionRepo,
                       ChatMessageRepository messageRepo,
                       AiServiceClient aiClient) {
        this.sessionRepo = sessionRepo;
        this.messageRepo = messageRepo;
        this.aiClient = aiClient;
    }

    /**
     * 创建聊天会话。
     */
    public ChatSession createSession(String userId) {
        ChatSession session = new ChatSession();
        session.setUserId(userId);
        return sessionRepo.save(session);
    }

    /**
     * 处理聊天请求：保存用户消息 -> 调用 AI 服务 -> 保存 AI 回复。
     *
     * 调用链路: ChatController -> ChatService.handleChat -> AiServiceClient.streamChat
     */
    public void handleChat(ChatRequest request, SseEmitter emitter) {
        UUID sessionId = UUID.fromString(request.getSessionId());

        // 1. 保存用户消息
        ChatMessage userMsg = new ChatMessage();
        userMsg.setSessionId(sessionId);
        userMsg.setRole("user");
        userMsg.setContent(request.getMessage());
        messageRepo.save(userMsg);

        // 2. 加载会话历史
        List<Map<String, String>> messages = new ArrayList<>();
        for (ChatMessage msg : messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId)) {
            messages.add(Map.of("role", msg.getRole(), "content", msg.getContent()));
        }

        // 3. 调用 AI 服务流式接口
        aiClient.streamChat(messages, request.isUseRag(), emitter);
    }

    /**
     * 获取会话历史消息。
     */
    public List<ChatMessage> getMessages(UUID sessionId) {
        return messageRepo.findBySessionIdOrderByCreatedAtAsc(sessionId);
    }
}

