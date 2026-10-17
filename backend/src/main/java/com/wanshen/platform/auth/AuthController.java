package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.auth.RegisteredUserStore.CreateUserInput;
import com.wanshen.platform.platform.TenantProvisioningService;
import com.wanshen.platform.web.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.*;

@RestController
public class AuthController {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AuthController.class);
    private final RegisteredUserStore users;
    private final CaptchaService captchaService;
    private final PasswordHasher passwordHasher;
    private final TokenService tokenService;
    private final TenantProvisioningService provisioningService;
    private final boolean demoAuthEnabled;
    private final List<String> demoAccounts;
    private final String demoPassword;
    private final String emailProvider;
    private final String sendGridKey;
    private final String appBaseUrl;
    @Value("${AUTH_EMAIL_FROM:}") private String emailFrom = "";
    private final SmsSender smsSender;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final SecureRandom random = new SecureRandom();
    private final Map<String, RateWindow> rates = new ConcurrentHashMap<>();

    public AuthController(
            RegisteredUserStore users, CaptchaService captchaService,
            PasswordHasher passwordHasher, TokenService tokenService,
            TenantProvisioningService provisioningService,
            @Value("${app.auth.demo-enabled}") boolean demoAuthEnabled,
            @Value("${app.auth.demo-accounts}") String demoAccounts,
            @Value("${app.auth.demo-password}") String demoPassword,
            @Value("${app.auth.email-provider:console}") String emailProvider,
            @Value("${SENDGRID_API_KEY:}") String sendGridKey,
            @Value("${APP_BASE_URL:http://127.0.0.1:5173}") String appBaseUrl,
            SmsSender smsSender
    ) {
        this.users = users;
        this.captchaService = captchaService;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.provisioningService = provisioningService;
        this.demoAuthEnabled = demoAuthEnabled;
        this.demoAccounts = Arrays.stream(demoAccounts.split(",")).map(String::trim).filter(item -> !item.isEmpty()).toList();
        this.demoPassword = demoPassword;
        this.emailProvider = emailProvider;
        this.sendGridKey = sendGridKey;
        this.appBaseUrl = appBaseUrl;
        this.smsSender = smsSender;
        tokenService.configureIdentity(users, demoAuthEnabled, demoAccounts);
    }

    @PostMapping("/api/v1/session/captcha")
    public CaptchaService.CaptchaResponse captcha() { return captchaService.render(captchaService.generate()); }

    @PostMapping("/api/v1/session/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        limit(httpRequest, "login", 10);
        validateLogin(request);
        if (!captchaService.verify(request.captchaId(), request.captchaCode())) {
            throw bad("图形验证码错误或已过期", "刷新验证码后重新输入");
        }
        if (demoAuthEnabled && demoAccounts.contains(request.account()) && demoPassword.equals(request.password())) {
            users.resetLoginFailures(request.account());
            SessionUser user = developmentUser(request.account());
            return ResponseEntity.ok(response(issue(user, "development-session-v1"), user, null));
        }
        RegisteredUser registered = users.findByAccount(request.account()).orElse(null);
        if (registered != null && users.isLoginLocked(request.account())) {
            throw forbidden("账号已临时锁定", "15分钟后重试或联系管理员");
        }
        if (registered != null && passwordHasher.verify(request.password(), registered.passwordHash())) {
            users.resetLoginFailures(request.account());
            if ("disabled".equals(registered.status())) throw forbidden("该账号已被禁用", "联系租户管理员");
            SessionUser user = registeredUser(registered);
            return ResponseEntity.ok(response(issue(user, "registered-user-v1"), user, registered.firstLogin()));
        }
        if (registered != null) users.registerLoginFailure(request.account());
        throw unauthorized("账号或密码不正确", "检查凭据后重试");
    }

    @GetMapping("/api/v1/session/me")
    public Map<String, Object> me(HttpServletRequest request) {
        TokenService.Claims claims = authenticate(request);
        String tenantId = request.getHeader("X-Tenant-Id");
        if (tenantId == null || tenantId.isBlank()) tenantId = claims.tenantIds().get(0);
        if (!claims.tenantIds().contains(tenantId)) throw forbidden("当前会话无权访问所选租户", "切换到已授权企业后重试");
        var context = new com.wanshen.platform.web.RequestContextService(tokenService,
                provisioningService == null ? null : provisioningService.store()).from(request);
        return Map.of("account", claims.sub(), "tenantId", tenantId, "permissions", context.permissions(),
                "permissionVersion", claims.permissionVersion());
    }

    @PostMapping("/api/v1/session/sms/send-code")
    public Map<String, Object> sendSms(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "sms", 5);
        String phone = text(input, "phone");
        if (!phone.matches("1[3-9]\\d{9}")) throw bad("请输入有效手机号", "检查手机号后重试");
        RegisteredUser registered = users.findByPhone(phone).orElse(null);
        if (registered != null && "disabled".equals(registered.status())) throw forbidden("该账号已被禁用", "联系租户管理员");
        limitKey("sms-phone:" + phone, 1);
        String code = String.valueOf(100000 + random.nextInt(900000));
        SmsSender.Delivery delivery = smsSender.send(phone, code);
        users.saveSmsCode(phone, code);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", delivery.development() ? "开发验证码已生成" : "验证码已发送，请查收短信");
        result.put("expiresIn", 300);
        result.put("requestId", delivery.requestId());
        if (delivery.development()) result.put("devCode", code);
        return result;
    }

    @PostMapping("/api/v1/session/sms/login")
    public ResponseEntity<?> smsLogin(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "sms-login", 10);
        String phone = text(input, "phone"); String code = text(input, "code");
        if (!phone.matches("1[3-9]\\d{9}") || !code.matches("\\d{6}")) throw bad("请求字段不符合规则", "检查手机号和验证码后重试");
        limitKey("sms-login-phone:" + phone, 5);
        RegisteredUser registered = users.findByPhone(phone).orElse(null);
        if (registered == null) throw unauthorized("手机号或验证码不正确", "检查账号绑定的手机号和验证码");
        if ("disabled".equals(registered.status())) throw forbidden("该账号已被禁用", "联系租户管理员");
        if (registered.firstLogin()) throw forbidden("请先使用初始密码完成首次登录设置", "使用账号密码登录并设置新密码");
        if (!users.verifySmsCode(phone, code)) throw unauthorized("验证码错误或已过期", "重新获取验证码后重试");
        SessionUser user = registeredUser(registered);
        return ResponseEntity.ok(response(issue(user, "registered-user-v1"), user, registered.firstLogin()));
    }

    @PostMapping("/api/v1/session/password/forgot")
    public Map<String, Object> forgotPassword(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "forgot", 3);
        String email = text(input, "email");
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw bad("请输入有效邮箱地址", "检查邮箱后重试");
        limitKey("forgot-email:" + email.toLowerCase(java.util.Locale.ROOT), 3);
        if (users.findByEmail(email).isEmpty()) return Map.of("message", "如果该邮箱已注册，验证码已发送");
        String code = String.valueOf(100000 + random.nextInt(900000));
        try {
            sendResetEmail(email, code);
        } catch (RuntimeException exception) {
            log.warn("忘记密码邮件发送失败 | 邮箱: {}", email, exception);
        }
        return Map.of("message", "如果该邮箱已注册，验证码已发送");
    }

    @PostMapping("/api/v1/session/password/reset")
    public ResponseEntity<Void> resetPassword(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "password-reset", 10);
        String email = text(input, "email"); String code = text(input, "code");
        String password = text(input, "newPassword");
        validatePassword(password);
        if (!users.verifyEmailCode(email.toLowerCase(java.util.Locale.ROOT), code.trim())) {
            throw unauthorized("验证码错误或已过期", "重新获取验证码");
        }
        RegisteredUser user = users.findByEmail(email).orElseThrow(() ->
                unauthorized("邮箱未注册", "检查邮箱地址"));
        String resetToken = users.generateResetToken(email);
        users.resetPassword(resetToken, passwordHasher.hash(password));
        log.info("[认证] 密码重置成功 | 邮箱: {}", email);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/session/register")
    public ResponseEntity<?> register(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "register", 3);
        String account = text(input, "account"); String password = text(input, "password");
        String name = text(input, "name"); String phone = text(input, "phone");
        String email = text(input, "email"); String tenantName = text(input, "tenantName");
        String industry = text(input, "industry");
        if (account.length() < 2 || account.length() > 50) throw bad("账号长度 2-50 个字符", "检查输入后重试");
        validatePassword(password);
        if (name.isBlank() || name.length() > 100) throw bad("姓名不合法", "检查输入后重试");
        if (!phone.matches("1[3-9]\\d{9}")) throw bad("请输入有效手机号", "检查手机号后重试");
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw bad("请输入有效邮箱地址", "检查邮箱后重试");
        if (tenantName.length() < 2 || tenantName.length() > 200) throw bad("公司名称至少 2 个字符", "检查输入后重试");
        if (industry.isBlank()) throw bad("请选择所属行业", "检查输入后重试");
        RegisteredUser user;
        try {
            user = users.createUser(new CreateUserInput(account, passwordHasher.hash(password), name, phone,
                    email, null, tenantName, industry, true, null, null, null));
        } catch (RegisteredUserStore.DuplicateAccountException exception) { throw conflict("该账号已被注册", "换一个账号名或直接登录"); }
        catch (RegisteredUserStore.DuplicatePhoneException exception) { throw conflict("该手机号已被注册", "换一个手机号或直接登录"); }
        catch (RegisteredUserStore.DuplicateEmailException exception) { throw conflict("该邮箱已被注册", "换一个邮箱或直接登录"); }
        SessionUser sessionUser = registeredUser(user);
        String baselineProvisioning = "completed";
        if (provisioningService != null) {
            try {
                provisioningService.provisionBaseline(new TenantProvisioningService.Input(
                        user.tenantId(), tenantName, account, name));
            } catch (RuntimeException exception) {
                baselineProvisioning = "pending";
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "注册成功，请使用注册的账号和密码登录");
        body.put("account", account);
        body.put("tenantName", tenantName);
        body.put("baselineProvisioning", baselineProvisioning);
        return ResponseEntity.status(201).body(body);
    }

    @PostMapping("/api/v1/platform/tenants/self-provision")
    public Map<String, Object> selfProvision(HttpServletRequest request) {
        TokenService.Claims admin = authenticate(request);
        String tenantId = Optional.ofNullable(request.getHeader("X-Tenant-Id"))
                .filter(value -> !value.isBlank()).orElse(admin.tenantIds().get(0));
        if (!admin.tenantIds().contains(tenantId) || admin.permissions() == null
                || !(admin.permissions().contains("*") || admin.permissions().contains("platform.role.manage"))) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "无权初始化所选企业权限", "由企业管理员初始化后再试");
        }
        RegisteredUser user = users.findByAccount(admin.sub()).orElse(null);
        String tenantName = user != null && !user.tenantName().isBlank() ? user.tenantName()
                : "TENANT-SHWS".equals(tenantId) ? "上海万申工业集团"
                : "TENANT-HDJG".equals(tenantId) ? "华东精工制造" : tenantId;
        if (provisioningService != null) {
            TenantProvisioningService.Result result = provisioningService.provisionBaseline(
                    new TenantProvisioningService.Input(tenantId, tenantName,
                            admin.sub(), user == null ? admin.sub() : user.name()));
            return Map.of("created", result.created(), "tenantId", result.tenantId());
        }
        return Map.of("created", false, "tenantId", tenantId);
    }

    @GetMapping("/api/v1/platform/employee-accounts")
    public Map<String, Object> employeeAccounts(HttpServletRequest request) {
        String tenantId = requireTenantAdmin(request);
        return Map.of("items", users.listUsersByTenant(tenantId).stream().map(user -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", user.id()); item.put("account", user.account()); item.put("name", user.name());
            item.put("phone", user.phone()); item.put("email", user.email()); item.put("department", user.department());
            item.put("employeeNo", user.employeeNo()); item.put("role", user.role());
            item.put("isTenantAdmin", user.isTenantAdmin()); item.put("firstLogin", user.firstLogin());
            item.put("status", user.status()); item.put("createdAt", user.createdAt());
            return item;
        }).toList());
    }

    @PostMapping("/api/v1/platform/employee-accounts")
    public ResponseEntity<?> createEmployeeAccount(@RequestBody JsonNode input, HttpServletRequest request) {
        String tenantId = requireTenantAdmin(request);
        String name = text(input, "name"); String phone = text(input, "phone"); String email = text(input, "email");
        String account = text(input, "account"); String department = text(input, "department");
        String employeeNo = optional(input, "employeeNo", "");
        if (name.isBlank() || name.length() > 100 || !phone.matches("1[3-9]\\d{9}")
                || !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+") || account.length() < 2 || account.length() > 50
                || department.isBlank() || employeeNo.length() > 50) {
            throw bad("请求字段不符合规则", "检查输入后重试");
        }
        String password = temporaryPassword();
        audit(request, tenantId, "employee.create.requested", account);
        try {
            RegisteredUser user = users.createUser(new CreateUserInput(account, passwordHasher.hash(password), name,
                    phone, email, tenantId, "", "", false, department, employeeNo, null));
            return ResponseEntity.status(201).body(Map.of("id", user.id(), "account", user.account(), "temporaryPassword", password));
        } catch (RegisteredUserStore.DuplicateAccountException exception) { throw conflict("该账号已被注册", "换一个账号名"); }
        catch (RegisteredUserStore.DuplicatePhoneException exception) { throw conflict("该手机号已被注册", "换一个手机号"); }
        catch (RegisteredUserStore.DuplicateEmailException exception) { throw conflict("该邮箱已被注册", "换一个邮箱"); }
    }

    @PutMapping("/api/v1/platform/employee-accounts/{id}/status")
    public ResponseEntity<Void> updateEmployeeStatus(@PathVariable String id, @RequestBody JsonNode input, HttpServletRequest request) {
        String tenantId = requireTenantAdmin(request);
        String status = text(input, "status");
        if (!Set.of("active", "disabled").contains(status)) throw bad("状态不合法", "检查输入后重试");
        RegisteredUser target = users.findById(id).orElse(null);
        if (target == null || !target.tenantId().equals(tenantId)) throw notFound("员工账号不存在", "检查账号 ID");
        if ("disabled".equals(status)) {
            var context = new com.wanshen.platform.web.RequestContextService(tokenService,
                    provisioningService == null ? null : provisioningService.store()).from(request);
            if (!context.has("platform.account.disable")) throw forbidden("无权停用员工账号", "由有停用权限的管理员操作");
        }
        audit(request, tenantId, "employee.status." + status + ".requested", target.account());
        users.updateUserStatus(id, status);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/platform/employee-accounts/{id}/reset-password")
    public Map<String, String> resetEmployeePassword(@PathVariable String id, HttpServletRequest request) {
        String tenantId = requireTenantAdmin(request);
        RegisteredUser target = users.findById(id).orElse(null);
        if (target == null || !target.tenantId().equals(tenantId)) throw notFound("员工账号不存在", "检查账号 ID");
        String password = temporaryPassword();
        audit(request, tenantId, "employee.password.reset.requested", target.account());
        users.updateFirstLogin(target.account(), true);
        users.updatePassword(target.account(), passwordHasher.hash(password));
        return Map.of("temporaryPassword", password);
    }

    @PostMapping("/api/v1/session/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request) {
        TokenService.Claims claims = authenticate(request);
        if (provisioningService != null && claims.tenantIds().stream()
                .anyMatch(tenant -> provisioningService.store().isSessionRevoked(tenant, claims))) {
            throw unauthorized("会话已撤销，请重新登录", "使用登录接口取得新的访问令牌");
        }
        RegisteredUser registered = users.findByAccount(claims.sub()).orElse(null);
        SessionUser user = registered == null
                ? new SessionUser(claims.sub(), claims.name(), claims.role(), "", claims.tenantIds(), claims.permissions(), claims.permissionVersion())
                : registeredUser(registered);
        if (!users.consumeSession(claims.jti(), claims.exp())) throw unauthorized("会话已被使用", "请重新登录");
        return ResponseEntity.ok(response(issue(user, claims.permissionVersion()), user, null));
    }

    @PostMapping("/api/v1/session/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        TokenService.Claims claims = authenticate(request);
        users.consumeSession(claims.jti(), claims.exp());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/session/change-password")
    public ResponseEntity<Void> changePassword(@RequestBody JsonNode input, HttpServletRequest request) {
        TokenService.Claims claims = authenticate(request);
        String oldPassword = text(input, "oldPassword"); String newPassword = text(input, "newPassword");
        validatePassword(newPassword);
        RegisteredUser registered = users.findByAccount(claims.sub()).orElse(null);
        if (registered != null) {
            if (!passwordHasher.verify(oldPassword, registered.passwordHash())) throw unauthorized("原密码不正确", "检查原密码后重试");
            users.updatePassword(claims.sub(), passwordHasher.hash(newPassword));
        } else throw forbidden("演示账号不支持修改密码", "使用企业正式账号");
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/session/complete-first-login")
    public ResponseEntity<Void> completeFirstLogin(@RequestBody JsonNode input, HttpServletRequest request) {
        limit(request, "first-login", 10);
        String account = text(input, "account"); String currentPassword = text(input, "currentPassword");
        String newPassword = text(input, "newPassword");
        validatePassword(newPassword);
        RegisteredUser user = users.findByAccount(account).orElse(null);
        if (user == null || !"active".equals(user.status())
                || !passwordHasher.verify(currentPassword, user.passwordHash())) throw unauthorized("验证失败", "检查账号和密码");
        if (!user.firstLogin()) throw conflict("该账号已完成首次登录设置", "直接登录即可");
        users.updatePassword(account, passwordHasher.hash(newPassword));
        users.updateFirstLogin(account, false);
        return ResponseEntity.noContent().build();
    }

    private TokenService.IssuedToken issue(SessionUser user, String version) {
        return tokenService.issue(user.account(), user.name(), user.role(), user.tenantIds(), user.permissions(), version);
    }
    private Map<String, Object> response(TokenService.IssuedToken token, SessionUser user, Object extra) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accessToken", token.accessToken()); result.put("expiresAt", token.expiresAt());
        result.put("tokenType", "Bearer"); result.put("user", user);
        if (extra != null) result.put("firstLogin", extra);
        return result;
    }
    private SessionUser registeredUser(RegisteredUser user) {
        return new SessionUser(user.account(), user.name(), user.role(), user.tenantName(),
                List.of(user.tenantId()), user.permissions(), "registered-user-v1");
    }
    private SessionUser developmentUser(String account) {
        List<String> accounts = List.of("test01", "reviewer", "operator", "inspector");
        List<String> names = List.of("test01", "生产复核员", "车间操作员", "质量检验员");
        int index = accounts.indexOf(account);
        return new SessionUser(account, index < 0 ? account : names.get(index), "超级管理员", "",
                List.of("TENANT-SHWS", "TENANT-HDJG"), List.of("*"), "development-session-v1");
    }
    private TokenService.Claims authenticate(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        String token = authorization == null || !authorization.matches("(?i)^Bearer\\s+.+$")
                ? null : authorization.replaceFirst("(?i)^Bearer\\s+", "");
        if (token == null || token.isBlank()) throw unauthorized("缺少有效登录会话", "使用登录接口取得访问令牌后重试");
        try {
            TokenService.Claims claims = tokenService.verify(token);
            String tenantId = selectedTenant(request, claims);
            if (provisioningService != null && provisioningService.store().isSessionRevoked(tenantId, claims)) {
                throw unauthorized("会话已注销，请重新登录", "使用登录接口取得新的访问令牌");
            }
            return claims;
        } catch (TokenService.InvalidTokenException exception) {
            throw unauthorized("登录会话无效或已过期", "请重新登录后再试");
        }
    }
    private String selectedTenant(HttpServletRequest request, TokenService.Claims claims) {
        String tenantId = Optional.ofNullable(request.getHeader("X-Tenant-Id"))
                .filter(value -> !value.isBlank()).orElse(claims.tenantIds().get(0));
        if (!claims.tenantIds().contains(tenantId)) throw forbidden("当前会话无权访问所选租户", "切换到已授权企业后重试");
        return tenantId;
    }
    private String requireTenantAdmin(HttpServletRequest request) {
        authenticate(request);
        var context = new com.wanshen.platform.web.RequestContextService(tokenService,
                provisioningService == null ? null : provisioningService.store()).from(request);
        if (!context.has("platform.account.manage")) throw forbidden("无权管理员工账号", "由企业管理员操作");
        return context.tenantId();
    }
    private void audit(HttpServletRequest request, String tenantId, String action, String target) {
        if (provisioningService == null) return;
        String id = UUID.randomUUID().toString();
        provisioningService.store().addAuditLog(Map.of("id", id, "tenantId", tenantId,
                "actor", tokenService.verify(request.getHeader("Authorization").replaceFirst("(?i)^Bearer\\s+", "")).sub(),
                "action", action, "target", target, "createdAt", Instant.now().toString()));
    }
    protected void sendResetEmail(String email, String token) {
        String link = appBaseUrl + "/reset-password?token=" + token;
        if ("sendgrid".equals(emailProvider) && !sendGridKey.isBlank()
                && emailFrom.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            try {
                Map<String, Object> body = Map.of("personalizations", List.of(Map.of("to", List.of(Map.of("email", email)))),
                        "from", Map.of("email", emailFrom), "subject", "工业AI平台 - 密码重置",
                        "content", List.of(Map.of("type", "text/html", "value", "<p>请点击以下链接重置密码：</p><p><a href=\"" + link + "\">" + link + "</a></p>")));
                HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.sendgrid.com/v3/mail/send"))
                        .timeout(Duration.ofSeconds(10))
                        .header("Authorization", "Bearer " + sendGridKey).header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(new ObjectMapper().writeValueAsString(body))).build();
                HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IllegalStateException("Email delivery rejected");
                return;
            } catch (Exception exception) { throw dependency("邮件服务商调用失败", "检查 SENDGRID_API_KEY 配置"); }
        }
        throw dependency("邮件服务尚未配置", "联系管理员配置密码重置邮件");
    }
    private void limit(HttpServletRequest request, String operation, int max) {
        limitKey(operation + ":" + request.getRemoteAddr(), max);
    }
    private void limitKey(String key, int max) {
        Instant now = Instant.now();
        RateWindow window = rates.compute(key, (ignored, value) ->
                value == null || value.window().isBefore(now) ? new RateWindow(now.plusSeconds(60), new ArrayList<>()) : value);
        synchronized (window) {
            window.requests().removeIf(item -> item.isBefore(now.minusSeconds(60)));
            if (window.requests().size() >= max) throw error(429, "AUTH_RATE_LIMITED", "请求过于频繁，请 60 秒后重试", "稍后再试");
            window.requests().add(now);
        }
    }
    private String temporaryPassword() {
        String characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < 16; index++) result.append(characters.charAt(random.nextInt(characters.length())));
        return result.toString();
    }
    private void validateLogin(LoginRequest request) {
        if (request == null || request.account() == null || request.account().isBlank() || request.account().length() > 100
                || request.password() == null || request.password().isBlank() || request.password().length() > 200
                || request.captchaId() == null || request.captchaCode() == null
                || !request.captchaCode().trim().toUpperCase().matches("[23456789A-Z]{4}")) {
            throw bad("请求字段不符合规则", "检查账号、密码和验证码");
        }
    }
    private void validatePassword(String password) {
        if (password == null || password.length() < 10 || password.length() > 200
                || !password.matches(".*[A-Z].*") || !password.matches(".*[a-z].*")
                || !password.matches(".*\\d.*")) {
            throw bad("密码至少10位，且必须包含大小写字母和数字", "检查密码后重试");
        }
    }
    private String text(JsonNode input, String field) { return input == null || !input.hasNonNull(field) ? "" : input.get(field).asText(); }
    private String optional(JsonNode input, String field, String fallback) { return input.hasNonNull(field) ? input.get(field).asText() : fallback; }
    private ApiException bad(String message, String suggestion) { return error(400, "PRODUCTION_400_INVALID_ARGUMENT", message, suggestion); }
    private ApiException unauthorized(String message, String suggestion) { return error(401, "PRODUCTION_401_UNAUTHENTICATED", message, suggestion); }
    private ApiException forbidden(String message, String suggestion) { return error(403, "PRODUCTION_403_PERMISSION_DENIED", message, suggestion); }
    private ApiException notFound(String message, String suggestion) { return error(404, "PRODUCTION_404_NOT_FOUND", message, suggestion); }
    private ApiException conflict(String message, String suggestion) { return error(409, "PRODUCTION_409_ILLEGAL_STATE", message, suggestion); }
    private ApiException dependency(String message, String suggestion) { return error(424, "PRODUCTION_424_DEPENDENCY_FAILED", message, suggestion); }
    private ApiException error(int status, String code, String message, String suggestion) { return new ApiException(status, code, message, suggestion); }
    public record LoginRequest(String account, String password, String captchaId, String captchaCode) {}
    public record SessionUser(String account, String name, String role, String tenantName,
                              List<String> tenantIds, List<String> permissions, String permissionVersion) {}
    private record RateWindow(Instant window, List<Instant> requests) {}

}
