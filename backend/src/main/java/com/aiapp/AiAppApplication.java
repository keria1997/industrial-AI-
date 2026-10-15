package com.aiapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 业务后端入口
 *
 * 职责: 鉴权、会话管理、参数校验、数据库存储。
 * 通过 AiServiceClient 调用 AI 服务，禁止在本层编写 prompt / Agent / RAG 逻辑。
 *
 * 调用链路: frontend -> backend/ChatController -> backend/ChatService -> backend/AiServiceClient -> ai-service
 */
@SpringBootApplication
public class AiAppApplication {
    public static void main(String[] args) {
        SpringApplication.run(AiAppApplication.class, args);
    }
}

