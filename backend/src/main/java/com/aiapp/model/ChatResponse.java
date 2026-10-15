package com.aiapp.model;

/**
 * 聊天响应 DTO
 *
 * 用于非流式响应和 SSE done 事件的 data。
 */
public class ChatResponse {
    private String messageId;
    private String content;

    public ChatResponse() {}

    public ChatResponse(String messageId, String content) {
        this.messageId = messageId;
        this.content = content;
    }

    // getters & setters
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}

