package com.wanshen.platform.auth;

import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CaptchaService {
    private static final String CHARACTERS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final long TTL_SECONDS = 300;

    private final SecureRandom random = new SecureRandom();
    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();

    public Challenge generate() {
        Instant expiresAt = Instant.now().plusSeconds(TTL_SECONDS);
        Challenge challenge = new Challenge(
                UUID.randomUUID(),
                randomCode(),
                expiresAt
        );
        challenges.put(challenge.id().toString(), challenge);
        challenges.values().removeIf(item -> item.expiresAt().isBefore(Instant.now()));
        return challenge;
    }

    public boolean verify(String captchaId, String code) {
        if (captchaId == null || code == null) {
            return false;
        }
        Challenge challenge = challenges.remove(captchaId);
        return challenge != null
                && challenge.expiresAt().isAfter(Instant.now())
                && challenge.code().equalsIgnoreCase(code.trim());
    }

    public CaptchaResponse render(Challenge challenge) {
        String svg = """
                <svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">
                  <rect width="120" height="40" fill="#18213d"/>
                  <path d="M8 32 C34 6 58 38 112 10" stroke="#60a5fa" stroke-width="2" fill="none" opacity="0.65"/>
                  <path d="M4 12 C38 38 72 4 116 30" stroke="#34d399" stroke-width="2" fill="none" opacity="0.55"/>
                  <text x="60" y="27" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#e2e8f0" text-anchor="middle" letter-spacing="7">%s</text>
                </svg>
                """.formatted(challenge.code());
        String encoded = URLEncoder.encode(svg, StandardCharsets.UTF_8).replace("+", "%20");
        return new CaptchaResponse(
                challenge.id().toString(),
                "data:image/svg+xml;charset=utf-8," + encoded,
                (int) Math.max(0, challenge.expiresAt().getEpochSecond() - Instant.now().getEpochSecond())
        );
    }

    private String randomCode() {
        StringBuilder value = new StringBuilder(4);
        for (int index = 0; index < 4; index++) {
            value.append(CHARACTERS.charAt(random.nextInt(CHARACTERS.length())));
        }
        return value.toString();
    }

    public record Challenge(UUID id, String code, Instant expiresAt) {}
    public record CaptchaResponse(String captchaId, String image, int expiresIn) {}
}
