package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.wanshen.platform.web.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class VolcengineSmsSenderTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-14T03:00:00Z"), ZoneOffset.UTC);
    private final VolcengineSmsSender.Settings settings = new VolcengineSmsSender.Settings(
            "test-ak", "test-secret", "sms-account", "approved-sign", "template-id", "xxxx");

    @Test void matchesIndependentHmacSignatureVector() throws Exception {
        assertThat(VolcengineSmsSender.authorization("test-ak", "test-secret", "sms.volcengineapi.com",
                "20261014T030000Z", "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"))
                .endsWith("Signature=d6bd83e301cdc43c2d35de56bcbbbb1eb15dcb56fa503eedd8bfe05e54c9a203");
    }

    @Test void sendsSignedUtf8TemplateRequestOverHttpAndRequiresAcceptedMessage() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> body = new AtomicReference<>(), auth = new AtomicReference<>(), query = new AtomicReference<>();
        server.createContext("/", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            query.set(exchange.getRequestURI().getRawQuery());
            byte[] response = """
                    {"ResponseMetadata":{"RequestId":"test-request"},"Code":"0","Result":{"MessageID":["message-1"]}}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            var sender = new VolcengineSmsSender(settings, mapper, HttpClient.newHttpClient(),
                    URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/"), clock);
            assertThat(sender.send("13800138000", "123456")).isEqualTo(new SmsSender.Delivery("test-request", false));
            var json = mapper.readTree(body.get());
            assertThat(json.path("SmsAccount").asText()).isEqualTo("sms-account");
            assertThat(json.path("TemplateId").asText()).isEqualTo("template-id");
            assertThat(json.path("Sign").asText()).isEqualTo("approved-sign");
            assertThat(json.path("PhoneNumbers").asText()).isEqualTo("13800138000");
            assertThat(mapper.readTree(json.path("TemplateParam").asText()).path("xxxx").asText()).isEqualTo("123456");
            assertThat(query.get()).isEqualTo("Action=SendSms&Version=2020-01-01");
            assertThat(auth.get()).contains("test-ak/20261014/cn-north-1/volcSMS/request",
                    "SignedHeaders=content-type;host;x-content-sha256;x-date");
            assertThat(auth.get()).doesNotContain("test-secret");
        } finally {
            server.stop(0);
        }
    }

    @SuppressWarnings("unchecked")
    private VolcengineSmsSender sender(int status, String body) throws Exception {
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        return new VolcengineSmsSender(settings, mapper, http, URI.create("https://sms.volcengineapi.com/"), clock);
    }

    @Test void surfacesSanitizedProviderCodesAndRequestIdWithoutRawMessages() throws Exception {
        var sender = sender(200, """
                {"ResponseMetadata":{"RequestId":"req-1","Error":{"Code":"InvalidSignature","Message":"test-secret 123456"}}}
                """);
        assertThatThrownBy(() -> sender.send("13800138000", "123456")).isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.status()).isEqualTo(424);
            assertThat(error.getMessage()).contains("InvalidSignature").doesNotContain("test-secret", "123456");
            assertThat(error.details().toString()).contains("req-1").doesNotContain("test-secret", "123456");
        });
    }

    @Test void rejectsBusinessFailureMalformedOrMissingAcceptance() throws Exception {
        for (String body : new String[] { "{\"Code\":\"1001\"}", "<html>failure</html>", "{}", "null",
                "{\"Code\":\"0\",\"Result\":{\"MessageID\":[]}}" }) {
            var sender = sender(200, body);
            assertThatThrownBy(() -> sender.send("13800138000", "123456")).isInstanceOf(ApiException.class);
        }
        var sender = sender(503, "{\"Code\":\"0\",\"Result\":{\"MessageID\":[\"id\"]}}");
        assertThatThrownBy(() -> sender.send("13800138000", "123456")).hasMessageContaining("HTTP_503");
    }

    @Test void timeoutDoesNotRetryOrPretendToSend() throws Exception {
        HttpClient http = mock(HttpClient.class);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenThrow(new HttpTimeoutException("timed out"));
        var sender = new VolcengineSmsSender(settings, mapper, http, URI.create("https://sms.volcengineapi.com/"), clock);
        assertThatThrownBy(() -> sender.send("13800138000", "123456")).hasMessageContaining("SEND_RESULT_UNKNOWN");
        verify(http, times(1)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test void failsClosedForUnknownProviderMissingCredentialsAndProductionConsole() {
        var config = new SmsConfiguration();
        for (MockEnvironment env : new MockEnvironment[] {
                new MockEnvironment().withProperty("app.auth.sms-provider", "unknown").withProperty("app.auth.demo-enabled", "true"),
                new MockEnvironment().withProperty("app.auth.sms-provider", "console").withProperty("app.auth.demo-enabled", "false"),
                new MockEnvironment().withProperty("app.auth.sms-provider", "volcengine"),
        }) {
            assertThatThrownBy(() -> config.smsSender(env, mapper).send("13800138000", "123456")).isInstanceOf(ApiException.class);
        }
        assertThat(config.smsSender(new MockEnvironment().withProperty("app.auth.demo-enabled", "true"), mapper)
                .send("13800138000", "123456").development()).isTrue();
    }
}
