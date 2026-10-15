package com.aiapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * AI 服务连接配置
 *
 * 配置 AI 服务地址，通过环境变量注入，禁止硬编码。
 * 调用链路: AiServiceConfig -> AiServiceClient -> AI 服务
 */
@Configuration
public class AiServiceConfig {

    @Value("${ai-service.base-url}")
    private String aiServiceBaseUrl;

    @Bean
    public RestClient aiServiceRestClient() {
        return RestClient.builder()
                .baseUrl(aiServiceBaseUrl)
                .build();
    }
}

