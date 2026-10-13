package com.wanshen.platform.auth;

import java.util.List;
import java.util.Optional;

public interface RegisteredUserStore {
    RegisteredUser createUser(CreateUserInput input);
    List<RegisteredUser> listUsersByTenant(String tenantId);
    Optional<RegisteredUser> findById(String id);
    Optional<RegisteredUser> findByAccount(String account);
    Optional<RegisteredUser> findByPhone(String phone);
    Optional<RegisteredUser> findByEmail(String email);
    void updatePassword(String account, String encodedPassword);
    void updateUserStatus(String id, String status);
    void updateFirstLogin(String account, boolean value);
    String generateSmsCode(String phone);
    boolean verifySmsCode(String phone, String code);
    String generateResetToken(String email);
    ResetToken verifyResetToken(String token);
    void markResetTokenUsed(String token);
    void revokeSession(String tenantId, String account);
    boolean isSessionRevoked(String tenantId, String account);

    record ResetToken(String token, String email) {}

    record CreateUserInput(
            String account, String encodedPassword, String name, String phone, String email,
            String tenantId, String tenantName, String industry, boolean isTenantAdmin,
            String department, String position, String employeeNo, String role
    ) {}

    class DuplicateAccountException extends RuntimeException {}
    class DuplicatePhoneException extends RuntimeException {}
    class DuplicateEmailException extends RuntimeException {}
}
