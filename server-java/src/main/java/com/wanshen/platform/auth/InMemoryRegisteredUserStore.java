package com.wanshen.platform.auth;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public class InMemoryRegisteredUserStore implements RegisteredUserStore {
    private final Map<String, RegisteredUser> users = new LinkedHashMap<>();
    private final Map<String, SmsCode> smsCodes = new LinkedHashMap<>();
    private final Map<String, ResetTokenData> resetTokens = new LinkedHashMap<>();
    private final List<String> revokedSessions = new ArrayList<>();

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
                input.role() == null || input.role().isBlank() ? "老板" : input.role(),
                input.isTenantAdmin(), true, input.department(), input.position(), input.employeeNo(),
                "active", List.of("*"), java.time.Instant.now().toString());
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
        if (current != null) users.put(account, replace(current, encodedPassword, current.firstLogin(), current.status()));
    }
    @Override
    public synchronized void updateUserStatus(String id, String status) {
        findById(id).ifPresent(current -> users.put(current.account(),
                replace(current, current.passwordHash(), current.firstLogin(), status)));
    }
    @Override
    public synchronized void updateFirstLogin(String account, boolean value) {
        RegisteredUser current = users.get(account);
        if (current != null) users.put(account, replace(current, current.passwordHash(), value, current.status()));
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
        String token = UUID.randomUUID().toString().replace("-", "");
        resetTokens.put(token, new ResetTokenData(email, java.time.Instant.now().plusSeconds(1800), false));
        return token;
    }
    @Override
    public synchronized ResetToken verifyResetToken(String token) {
        ResetTokenData record = resetTokens.get(token);
        if (record == null || record.used() || record.expiresAt().isBefore(java.time.Instant.now())) return null;
        return new ResetToken(token, record.email());
    }
    @Override
    public synchronized void markResetTokenUsed(String token) {
        ResetTokenData record = resetTokens.get(token);
        if (record != null) resetTokens.put(token, new ResetTokenData(record.email(), record.expiresAt(), true));
    }
    @Override
    public synchronized void revokeSession(String tenantId, String account) {
        revokedSessions.add(tenantId + ":" + account);
    }
    @Override
    public synchronized boolean isSessionRevoked(String tenantId, String account) {
        return revokedSessions.contains(tenantId + ":" + account);
    }

    private RegisteredUser replace(RegisteredUser current, String password, boolean firstLogin, String status) {
        return new RegisteredUser(current.id(), current.account(), password, current.name(), current.phone(),
                current.email(), current.tenantId(), current.tenantName(), current.industry(), current.role(),
                current.isTenantAdmin(), firstLogin, current.department(), current.position(),
                current.employeeNo(), status, current.permissions(), current.createdAt());
    }
    private RegisteredUser copy(RegisteredUser value) { return value; }
    private record SmsCode(String code, java.time.Instant expiresAt, boolean used) {
        SmsCode(String code, java.time.Instant expiresAt) { this(code, expiresAt, false); }
    }
    private record ResetTokenData(String email, java.time.Instant expiresAt, boolean used) {}
}
