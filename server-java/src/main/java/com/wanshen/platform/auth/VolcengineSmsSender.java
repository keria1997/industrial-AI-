package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public class VolcengineSmsSender implements SmsSender {
    private static final Logger log = LoggerFactory.getLogger(VolcengineSmsSender.class);
    private static final URI ENDPOINT = URI.create("https://sms.volcengineapi.com/");
    private static final String QUERY = "Action=SendSms&Version=2020-01-01";
    private static final String CONTENT_TYPE = "application/json";
    private static final String SIGNED_HEADERS = "content-type;host;x-content-sha256;x-date";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);
    private final Settings settings;
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final URI endpoint;
    private final Clock clock;

    public VolcengineSmsSender(Settings settings, ObjectMapper mapper) {
        this(settings, mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build(),
                ENDPOINT, Clock.systemUTC());
    }

    VolcengineSmsSender(Settings settings, ObjectMapper mapper, HttpClient http, URI endpoint, Clock clock) {
        this.settings = settings;
        this.mapper = mapper;
        this.http = http;
        this.endpoint = endpoint;
        this.clock = clock;
    }

    @Override
    public Delivery send(String phone, String code) {
        if (List.of(settings.accessKeyId(), settings.accessKeySecret(), settings.account(), settings.signName(),
                settings.templateCode(), settings.variable()).stream().anyMatch(String::isBlank)) {
            throw failure("CONFIGURATION_MISSING", "");
        }
        try {
            byte[] body = mapper.writeValueAsBytes(Map.of(
                    "SmsAccount", settings.account(), "Sign", settings.signName(),
                    "TemplateId", settings.templateCode(), "PhoneNumbers", phone,
                    "TemplateParam", mapper.writeValueAsString(Map.of(settings.variable(), code))));
            String date = DATE.format(clock.instant());
            String hash = sha256(body);
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint + "?" + QUERY))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", CONTENT_TYPE)
                    .header("X-Date", date)
                    .header("X-Content-Sha256", hash)
                    .header("Authorization", authorization(settings.accessKeyId(), settings.accessKeySecret(),
                            endpoint.getRawAuthority(), date, hash))
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode result;
            try {
                result = mapper.readTree(response.body());
            } catch (IOException exception) {
                throw failure("INVALID_RESPONSE", "");
            }
            if (result == null) throw failure("INVALID_RESPONSE", "");
            String requestId = result.path("ResponseMetadata").path("RequestId").asText();
            if (!requestId.matches("[A-Za-z0-9_.-]{1,100}")) requestId = "";
            JsonNode error = result.path("ResponseMetadata").path("Error");
            if (!error.isMissingNode() && !error.isNull()) {
                throw failure(safeIdentifier(error.path("Code").asText()), requestId);
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw failure("HTTP_" + response.statusCode(), requestId);
            }
            String status = result.path("Code").asText();
            if (!"0".equals(status)) throw failure(safeIdentifier(status), requestId);
            JsonNode ids = result.path("Result").path("MessageID");
            if (requestId.isBlank() || !ids.isArray() || ids.isEmpty()) throw failure("INVALID_RESPONSE", requestId);
            for (JsonNode id : ids) {
                if (!id.isTextual() || id.asText().isBlank()) throw failure("INVALID_RESPONSE", requestId);
            }
            log.info("SMS request accepted provider=volcengine requestId={}", requestId);
            return new Delivery(requestId, false);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("SEND_INTERRUPTED", "");
        } catch (IOException exception) {
            // A timeout may have delivered the SMS; never retry automatically or claim success.
            throw failure("SEND_RESULT_UNKNOWN", "");
        } catch (GeneralSecurityException exception) {
            throw failure("SIGNING_FAILED", "");
        }
    }

    static String authorization(String accessKeyId, String secret, String host, String date, String bodyHash)
            throws GeneralSecurityException {
        String scope = date.substring(0, 8) + "/cn-north-1/volcSMS/request";
        String headers = "content-type:" + CONTENT_TYPE + "\nhost:" + host
                + "\nx-content-sha256:" + bodyHash + "\nx-date:" + date + "\n";
        String canonical = "POST\n/\n" + QUERY + "\n" + headers + "\n" + SIGNED_HEADERS + "\n" + bodyHash;
        String toSign = "HMAC-SHA256\n" + date + "\n" + scope + "\n"
                + sha256(canonical.getBytes(StandardCharsets.UTF_8));
        byte[] key = hmac(secret.getBytes(StandardCharsets.UTF_8), date.substring(0, 8));
        key = hmac(key, "cn-north-1");
        key = hmac(key, "volcSMS");
        key = hmac(key, "request");
        return "HMAC-SHA256 Credential=" + accessKeyId + "/" + scope + ", SignedHeaders="
                + SIGNED_HEADERS + ", Signature=" + HexFormat.of().formatHex(hmac(key, toSign));
    }

    private static byte[] hmac(byte[] key, String value) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256(byte[] bytes) throws GeneralSecurityException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static String safeIdentifier(String value) {
        return value != null && value.matches("[A-Za-z0-9_.-]{1,100}") ? value : "INVALID_RESPONSE";
    }

    private static ApiException failure(String code, String requestId) {
        log.warn("SMS send failed provider=volcengine code={} requestId={}", code, requestId);
        return new ApiException(424, "AUTH_SMS_SEND_FAILED",
                "短信发送失败（错误码：" + code + "）", "请联系管理员核对短信配置；发送结果未知时请先检查手机短信",
                Map.of("provider", "volcengine", "providerCode", code, "requestId", requestId));
    }

    // Credentials must not be included in a generated record toString().
    public static final class Settings {
        private final String accessKeyId, accessKeySecret, account, signName, templateCode, variable;

        public Settings(String accessKeyId, String accessKeySecret, String account, String signName,
                        String templateCode, String variable) {
            this.accessKeyId = accessKeyId;
            this.accessKeySecret = accessKeySecret;
            this.account = account;
            this.signName = signName;
            this.templateCode = templateCode;
            this.variable = variable;
        }

        String accessKeyId() { return accessKeyId; }
        String accessKeySecret() { return accessKeySecret; }
        String account() { return account; }
        String signName() { return signName; }
        String templateCode() { return templateCode; }
        String variable() { return variable; }
    }
}
