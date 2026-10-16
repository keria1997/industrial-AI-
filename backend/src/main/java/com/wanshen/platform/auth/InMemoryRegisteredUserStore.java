package com.wanshen.platform.auth;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public class InMemoryRegisteredUserStore implements RegisteredUserStore {
    private final Map<String, RegisteredUser> users = new LinkedHashMap<>();
    private final Map<String, SmsCode> smsCodes = new LinkedHashMap<>();
    private final Map<String, ResetTokenData> resetTokens = new LinkedHashMap<>();
    private final Map<String, Long> consumedSessions = new LinkedHashMap<>();

    @Override
    public synchronized RegisteredUser createUser(CreateUserInput input) {
        if (users.containsKey(input.account())) throw new DuplicateAccountException();
        if (users.values().stream().anyMatch(item -> item.phone().equals(input.phone()))) {
            throw new DuplicatePhoneException();
        }
        if (users.values().stream().anyMatch(item -> item.email().equals(input.email()))) {
            throw new DuplicateEmailException();
        }
        String tenantId = input.tenantId() == null || input.tenantId().isBlank()
                ? "TENANT-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase()
                : input.tenantId();
        RegisteredUser user = new RegisteredUser(UUID.randomUUID().toString(), input.account(),
                input.encodedPassword(), input.name(), input.phone(), input.email(), tenantId,
                input.tenantName() == null ? "" : input.tenantName(),
                input.industry() == null ? "" : input.industry(),
                input.role() == null || input.role().isBlank() ? input.isTenantAdmin() ? "老板" : "员工" : input.role(),
                input.isTenantAdmin(), !input.isTenantAdmin(), input.department(), input.position(), input.employeeNo(),
                "active", input.isTenantAdmin() ? List.of("*") : List.of(), java.time.Instant.now().toString(), 1);
        users.put(user.account(), user);
        return copy(user);
    }

    @Override
    public synchronized List<RegisteredUser> listUsersByTenant(String tenantId) {
        return users.values().stream().filter(item -> item.tenantId().equals(tenantId))
                .map(this::copy).toList();
    }
    @Override
    public synchronized Optional<RegisteredUser> findById(String id) {
        return users.values().stream().filter(item -> item.id().equals(id)).findFirst().map(this::copy);
    }
    @Override
    public synchronized Optional<RegisteredUser> findByAccount(String account) {
        return Optional.ofNullable(users.get(account)).map(this::copy);
    }
    @Override
    public synchronized Optional<RegisteredUser> findByPhone(String phone) {
        return users.values().stream().filter(item -> item.phone().equals(phone)).findFirst().map(this::copy);
    }
    @Override
    public synchronized Optional<RegisteredUser> findByEmail(String email) {
        return users.values().stream().filter(item -> item.email().equals(email)).findFirst().map(this::copy);
    }
    @Override
    public synchronized void updatePassword(String account, String encodedPassword) {
        RegisteredUser current = users.get(account);
        if (current != null) users.put(account, replace(current, encodedPassword, current.firstLogin(), current.status(), true));
    }
    @Override
    public synchronized void updateUserStatus(String id, String status) {
        findById(id).ifPresent(current -> users.put(current.account(),
                replace(current, current.passwordHash(), current.firstLogin(), status, true)));
    }
    @Override
    public synchronized void updateFirstLogin(String account, boolean value) {
        RegisteredUser current = users.get(account);
        if (current != null) users.put(account, replace(current, current.passwordHash(), value, current.status(), true));
    }
    @Override
    public synchronized void saveSmsCode(String phone, String code) {
        smsCodes.put(phone, new SmsCode(code, java.time.Instant.now().plusSeconds(300)));
    }
    @Override
    public synchronized boolean verifySmsCode(String phone, String code) {
        SmsCode record = smsCodes.get(phone);
        if (record == null || record.used() || !record.code().equals(code)
                || record.expiresAt().isBefore(java.time.Instant.now())) return false;
        smsCodes.put(phone, new SmsCode(record.code(), record.expiresAt(), true));
        return true;
    }
    @Override
    public synchronized String generateResetToken(String email) {
        String token = ResetTokens.generate();
        resetTokens.entrySet().removeIf(entry -> email.equals(entry.getValue().email()));
        resetTokens.put(ResetTokens.hash(token), new ResetTokenData(email, java.time.Instant.now().plusSeconds(1800), false));
        return token;
    }
    @Override
    public synchronized boolean resetPassword(String token, String encodedPassword) {
        String hash = ResetTokens.hash(token);
        ResetTokenData record = resetTokens.get(hash);
        if (record == null || record.used() || !record.expiresAt().isAfter(java.time.Instant.now())) return false;
        RegisteredUser user = findByEmail(record.email()).orElse(null);
        if (user == null || !"active".equals(user.status())) return false;
        users.put(user.account(), replace(user, encodedPassword, false, user.status(), true));
        resetTokens.replaceAll((key, value) -> value.email().equals(record.email())
                ? new ResetTokenData(value.email(), value.expiresAt(), true) : value);
        return true;
    }
    @Override
    public synchronized boolean consumeSession(String jti, long expiresAt) {
        consumedSessions.entrySet().removeIf(entry -> entry.getValue() <= java.time.Instant.now().getEpochSecond());
        return consumedSessions.putIfAbsent(jti, expiresAt) == null;
    }
    @Override
    public synchronized boolean isSessionConsumed(String jti) { return consumedSessions.containsKey(jti); }

    private RegisteredUser replace(RegisteredUser current, String password, boolean firstLogin, String status, boolean invalidate) {
        return new RegisteredUser(current.id(), current.account(), password, current.name(), current.phone(),
                current.email(), current.tenantId(), current.tenantName(), current.industry(), current.role(),
                current.isTenantAdmin(), firstLogin, current.department(), current.position(),
                current.employeeNo(), status, current.permissions(), current.createdAt(),
                current.sessionVersion() + (invalidate ? 1 : 0));
    }
    private RegisteredUser copy(RegisteredUser value) { return value; }
    private record SmsCode(String code, java.time.Instant expiresAt, boolean used) {
        SmsCode(String code, java.time.Instant expiresAt) { this(code, expiresAt, false); }
    }
    private record ResetTokenData(String email, java.time.Instant expiresAt, boolean used) {}
}
