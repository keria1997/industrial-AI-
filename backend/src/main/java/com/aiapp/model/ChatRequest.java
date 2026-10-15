package com.aiapp.model;

/**
 * 聊天请求 DTO（前端 -> 后端）
 *
 * 后端校验参数后转发给 AI 服务。
 */
public class ChatRequest {
    private String sessionId;
    private String message;
    private boolean useRag;

    // getters & setters
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public boolean isUseRag() { return useRag; }
    public void setUseRag(boolean useRag) { this.useRag = useRag; }
}

