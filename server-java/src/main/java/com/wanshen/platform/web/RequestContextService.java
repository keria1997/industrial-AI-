package com.wanshen.platform.web;

import com.wanshen.platform.auth.TokenService;
import com.wanshen.platform.platform.PlatformProvisioningStore;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class RequestContextService {
    private final TokenService tokenService;
    private final PlatformProvisioningStore platformStore;

    public RequestContextService(TokenService tokenService) {
        this(tokenService, null);
    }

    @Autowired
    public RequestContextService(TokenService tokenService, PlatformProvisioningStore platformStore) {
        this.tokenService = tokenService;
        this.platformStore = platformStore;
    }

    public RequestContext from(HttpServletRequest request) {
        String token = Optional.ofNullable(request.getHeader("Authorization"))
                .filter(value -> value.matches("(?i)^Bearer\\s+.+$"))
                .map(value -> value.replaceFirst("(?i)^Bearer\\s+", ""))
                .orElseThrow(() -> new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "缺少有效登录会话", "使用登录接口取得访问令牌后重试"));
        TokenService.Claims claims;
        try {
            claims = tokenService.verify(token);
        } catch (TokenService.InvalidTokenException exception) {
            throw new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "登录会话无效或已过期", "请重新登录后再试");
        }
        String tenantId = request.getHeader("X-Tenant-Id");
        if (tenantId == null || tenantId.isBlank()) tenantId = claims.tenantIds().get(0);
        if (!claims.tenantIds().contains(tenantId)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "当前会话无权访问所选租户", "切换到已授权企业后重试");
        }
        if (platformStore != null && platformStore.isSessionRevoked(tenantId, claims.sub())) {
            throw new ApiException(401, "PRODUCTION_401_UNAUTHENTICATED", "会话已注销，请重新登录", "使用登录接口取得新的访问令牌");
        }
        List<String> permissions = claims.permissions() == null ? List.of() : claims.permissions();
        return new RequestContext(
                tenantId,
                claims.sub(),
                permissions,
                Optional.ofNullable(request.getHeader("X-Trace-Id")).orElse("trace-" + System.nanoTime()),
                request.getHeader("X-Idempotency-Key"),
                parseIfMatch(request.getHeader("If-Match"))
        );
    }

    private Integer parseIfMatch(String value) {
        if (value == null) return null;
        var matcher = java.util.regex.Pattern.compile("\"?(\\d+)\"?").matcher(value.trim());
        return matcher.matches() ? Integer.valueOf(matcher.group(1)) : null;
    }

    public record RequestContext(
            String tenantId,
            String actorId,
            List<String> permissions,
            String traceId,
            String idempotencyKey,
            Integer expectedVersion
    ) {
        public boolean has(String permission) {
            return permissions.contains("*") || permissions.contains(permission);
        }
    }
}
