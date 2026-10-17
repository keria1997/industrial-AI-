package com.wanshen.platform.auth;

import com.fasterxml.jackson.databind.ObjectMapper;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class JdbcRegisteredUserStore implements RegisteredUserStore {
    private final DataSource dataSource;
    private final ObjectMapper objectMapper;

    public JdbcRegisteredUserStore(DataSource dataSource, ObjectMapper objectMapper) {
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
    }

    @Override
    public RegisteredUser createUser(CreateUserInput input) {
        String tenantId = input.tenantId() == null || input.tenantId().isBlank()
                ? "TENANT-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase()
                : input.tenantId();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO registered_users
                  (account, password_hash, name, phone, email, tenant_id, tenant_name, industry,
                   is_tenant_admin, first_login, department, position, employee_no, role, permissions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                RETURNING *
                """)) {
            bind(statement, 1, input.account()); bind(statement, 2, input.encodedPassword());
            bind(statement, 3, input.name()); bind(statement, 4, input.phone());
            bind(statement, 5, input.email()); bind(statement, 6, tenantId);
            bind(statement, 7, input.tenantName()); bind(statement, 8, input.industry());
            statement.setBoolean(9, input.isTenantAdmin());
            statement.setBoolean(10, !input.isTenantAdmin());
            bind(statement, 11, input.department()); bind(statement, 12, input.position());
            bind(statement, 13, input.employeeNo());
            bind(statement, 14, input.role() == null || input.role().isBlank()
                    ? input.isTenantAdmin() ? "老板" : "员工" : input.role());
            statement.setString(15, input.isTenantAdmin() ? "[\"*\"]" : "[]");
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                RegisteredUser user = map(result);
                connection.commit();
                return user;
            }
            }
        } catch (SQLException exception) {
            String message = exception.getMessage() == null ? "" : exception.getMessage().toLowerCase();
            if ("23505".equals(exception.getSQLState())) {
                if (message.contains("account")) throw new DuplicateAccountException();
                if (message.contains("phone")) throw new DuplicatePhoneException();
                if (message.contains("email")) throw new DuplicateEmailException();
            }
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public List<RegisteredUser> listUsersByTenant(String tenantId) {
        return query("SELECT * FROM registered_users WHERE tenant_id = ? ORDER BY created_at", statement -> {
            statement.setString(1, tenantId);
            return null;
        });
    }
    @Override
    public Optional<RegisteredUser> findById(String id) {
        return first("SELECT * FROM registered_users WHERE id::text = ?", id);
    }
    @Override
    public Optional<RegisteredUser> findByAccount(String account) {
        return first("SELECT * FROM registered_users WHERE account = ?", account);
    }
    @Override
    public Optional<RegisteredUser> findByPhone(String phone) {
        return first("SELECT * FROM registered_users WHERE phone = ?", phone);
    }
    @Override
    public Optional<RegisteredUser> findByEmail(String email) {
        return first("SELECT * FROM registered_users WHERE email = ?", email);
    }
    @Override
    public void updatePassword(String account, String encodedPassword) {
        updateUser(account, "UPDATE registered_users SET password_hash = ?, session_version = session_version + 1 WHERE account = ?", statement -> {
            statement.setString(1, encodedPassword); statement.setString(2, account); return null;
        });
    }
    @Override
    public void updateUserStatus(String id, String status) {
        findById(id).ifPresent(user -> updateUser(user.account(),
                "UPDATE registered_users SET status = ?, session_version = session_version + 1 WHERE id::text = ?", statement -> {
                    statement.setString(1, status); statement.setString(2, id); return null;
                }));
    }
    @Override
    public void updateFirstLogin(String account, boolean value) {
        updateUser(account, "UPDATE registered_users SET first_login = ?, session_version = session_version + 1 WHERE account = ?", statement -> {
            statement.setBoolean(1, value); statement.setString(2, account); return null;
        });
    }
    @Override
    public void saveSmsCode(String phone, String code) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement lock = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
                    lock.setString(1, phone);
                    lock.execute();
                }
                try (PreparedStatement invalidate = connection.prepareStatement(
                        "UPDATE sms_codes SET used = TRUE WHERE phone = ? AND used = FALSE")) {
                    invalidate.setString(1, phone);
                    invalidate.executeUpdate();
                }
                try (PreparedStatement insert = connection.prepareStatement(
                        "INSERT INTO sms_codes (phone, code, expires_at) VALUES (?, ?, ?)")) {
                    insert.setString(1, phone); insert.setString(2, code);
                    insert.setTimestamp(3, Timestamp.from(Instant.now().plusSeconds(300)));
                    insert.executeUpdate();
                }
                connection.commit();
            } catch (SQLException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not persist SMS challenge", exception);
        }
    }
    @Override
    public boolean verifySmsCode(String phone, String code) {
        return update("UPDATE sms_codes SET used = TRUE WHERE phone = ? AND code = ? AND used = FALSE AND expires_at > now()", statement -> {
            statement.setString(1, phone); statement.setString(2, code); return null;
        }) > 0;
    }

    @Override
    public void saveEmailCode(String email, String code) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            enableAuthLookup(connection);
            try (PreparedStatement invalidate = connection.prepareStatement(
                    "UPDATE auth_email_code SET consumed_at = now() WHERE email_hash = ? AND consumed_at IS NULL")) {
                invalidate.setString(1, ResetTokens.hash(email.toLowerCase()));
                invalidate.executeUpdate();
            }
            try (PreparedStatement insert = connection.prepareStatement("""
                    INSERT INTO auth_email_code (email_hash, code_hash, purpose, expires_at)
                    VALUES (?, ?, 'PASSWORD_RESET', ?)
                    """)) {
                insert.setString(1, ResetTokens.hash(email.toLowerCase()));
                insert.setString(2, ResetTokens.hash(code));
                insert.setTimestamp(3, Timestamp.from(Instant.now().plusSeconds(600)));
                insert.executeUpdate();
            }
            connection.commit();
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not persist password reset challenge", exception);
        }
    }

    @Override
    public boolean verifyEmailCode(String email, String code) {
        return update("""
                UPDATE auth_email_code SET consumed_at = now()
                WHERE email_hash = ? AND code_hash = ? AND consumed_at IS NULL
                  AND expires_at > now()
                """, statement -> {
            statement.setString(1, ResetTokens.hash(email.toLowerCase()));
            statement.setString(2, ResetTokens.hash(code));
            return null;
        }) > 0;
    }

    @Override
    public boolean isLoginLocked(String account) {
        return Boolean.TRUE.equals(queryValue("""
                SELECT locked_until IS NOT NULL AND locked_until > now() AS locked
                FROM auth_login_lock WHERE account = ?
                """, statement -> { statement.setString(1, account); return null; }, "locked"));
    }

    @Override
    public void registerLoginFailure(String account) {
        update("""
                INSERT INTO auth_login_lock (account, failed_count, locked_until, last_failed_at)
                VALUES (?, 1, CASE WHEN 1 >= 5 THEN now() + interval '15 minutes' END, now())
                ON CONFLICT (account) DO UPDATE SET
                  failed_count = auth_login_lock.failed_count + 1,
                  locked_until = CASE WHEN auth_login_lock.failed_count + 1 >= 5
                    THEN now() + interval '15 minutes' ELSE auth_login_lock.locked_until END,
                  last_failed_at = now(), updated_at = now()
                """, statement -> { statement.setString(1, account); return null; });
    }

    @Override
    public void resetLoginFailures(String account) {
        update("DELETE FROM auth_login_lock WHERE account = ?",
                statement -> { statement.setString(1, account); return null; });
    }
    @Override
    public String generateResetToken(String email) {
        String token = ResetTokens.generate();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                lockResetEmail(connection, email);
                try (var statement = connection.prepareStatement("UPDATE password_reset_tokens SET used = TRUE WHERE email = ?")) {
                    statement.setString(1, email); statement.executeUpdate();
                }
                try (var statement = connection.prepareStatement(
                        "INSERT INTO password_reset_tokens (token, email, expires_at) VALUES (?, ?, ?)")) {
                    statement.setString(1, ResetTokens.hash(token)); statement.setString(2, email);
                    statement.setTimestamp(3, Timestamp.from(Instant.now().plusSeconds(1800)));
                    statement.executeUpdate();
                }
                connection.commit();
            } catch (SQLException exception) { connection.rollback(); throw exception; }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
        return token;
    }
    @Override
    public boolean resetPassword(String token, String encodedPassword) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                String email;
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT email FROM password_reset_tokens WHERE token = ? AND NOT used AND expires_at > now()")) {
                    statement.setString(1, ResetTokens.hash(token));
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) { connection.rollback(); return false; }
                        email = result.getString(1);
                    }
                }
                lockResetEmail(connection, email);
                try (PreparedStatement statement = connection.prepareStatement("""
                        UPDATE password_reset_tokens SET used = TRUE
                        WHERE token = ? AND used = FALSE AND expires_at > now() RETURNING email
                        """)) {
                    statement.setString(1, ResetTokens.hash(token));
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) { connection.rollback(); return false; }
                    }
                }
                try (var statement = connection.prepareStatement("SELECT set_config('app.auth_lookup', 'true', true)")) { statement.execute(); }
                String tenantId;
                try (var statement = connection.prepareStatement("SELECT tenant_id FROM registered_users WHERE email = ?")) {
                    statement.setString(1, email);
                    try (var result = statement.executeQuery()) {
                        if (!result.next()) { connection.rollback(); return false; }
                        tenantId = result.getString(1);
                    }
                }
                bindTenant(connection, tenantId);
                try (PreparedStatement statement = connection.prepareStatement("""
                        UPDATE registered_users SET password_hash = ?, first_login = FALSE,
                        session_version = session_version + 1 WHERE email = ? AND status = 'active'
                        """)) {
                    statement.setString(1, encodedPassword); statement.setString(2, email);
                    if (statement.executeUpdate() != 1) { connection.rollback(); return false; }
                }
                connection.commit();
                return true;
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw exception;
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }
    private void lockResetEmail(Connection connection, String email) throws SQLException {
        try (var lock = connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))")) {
            lock.setString(1, "password-reset:" + email); lock.execute();
        }
    }
    @Override
    public boolean consumeSession(String jti, long expiresAt) {
        return update("""
                INSERT INTO auth_consumed_session (jti, expires_at) VALUES (?, ?)
                ON CONFLICT (jti) DO NOTHING
                """, statement -> {
            statement.setString(1, jti); statement.setTimestamp(2, Timestamp.from(Instant.ofEpochSecond(expiresAt)));
            return null;
        }) == 1;
    }
    @Override
    public boolean isSessionConsumed(String jti) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT 1 FROM auth_consumed_session WHERE jti = ? AND expires_at > now()")) {
            statement.setString(1, jti);
            try (ResultSet result = statement.executeQuery()) { return result.next(); }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }

    private void updateUser(String account, String sql, SqlBinder binder) {
        RegisteredUser user = findByAccount(account).orElseThrow();
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, user.tenantId());
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                binder.bind(statement);
                statement.executeUpdate();
                connection.commit();
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }

    private List<RegisteredUser> query(String sql, SqlBinder binder) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement context = connection.prepareStatement(
                    "SELECT set_config('app.auth_lookup', 'true', true)")) { context.execute(); }
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            try (ResultSet result = statement.executeQuery()) {
                List<RegisteredUser> users = new ArrayList<>();
                while (result.next()) users.add(map(result));
                connection.commit();
                return users;
            }
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }
    private Optional<RegisteredUser> first(String sql, String value) {
        return query(sql, statement -> { statement.setString(1, value); return null; }).stream().findFirst();
    }
    private int update(String sql, SqlBinder binder) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            enableAuthLookup(connection);
            binder.bind(statement);
            return statement.executeUpdate();
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }

    private <T> T queryValue(String sql, SqlBinder binder, String column) {
        try (Connection connection = dataSource.getConnection()) {
            enableAuthLookup(connection);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                binder.bind(statement);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) return null;
                    Object value = result.getObject(column);
                    if (value instanceof Boolean bool) return (T) Boolean.valueOf(bool);
                    if (value == null) return null;
                    throw new IllegalStateException("Unexpected column type for " + column);
                }
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }

    private void enableAuthLookup(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT set_config('app.auth_lookup', 'true', true)")) { statement.execute(); }
    }
    private void bindTenant(Connection connection, String tenantId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT set_config('app.tenant_id', ?, true)")) {
            statement.setString(1, tenantId); statement.execute();
        }
    }
    private RegisteredUser map(ResultSet row) throws SQLException {
        return new RegisteredUser(row.getString("id"), row.getString("account"), row.getString("password_hash"),
                row.getString("name"), row.getString("phone"), row.getString("email"), row.getString("tenant_id"),
                row.getString("tenant_name"), row.getString("industry"), row.getString("role"),
                row.getBoolean("is_tenant_admin"), row.getBoolean("first_login"), row.getString("department"),
                row.getString("position"), row.getString("employee_no"), row.getString("status"),
                readPermissions(row), row.getTimestamp("created_at").toInstant().toString(), row.getLong("session_version"));
    }
    private List<String> readPermissions(ResultSet row) throws SQLException {
        try {
            List<String> permissions = objectMapper.readValue(row.getString("permissions"),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
            if (permissions == null || permissions.stream().anyMatch(java.util.Objects::isNull)) return List.of();
            return row.getBoolean("is_tenant_admin") ? List.copyOf(permissions)
                    : permissions.stream().filter(value -> !"*".equals(value)).toList();
        } catch (Exception exception) { return List.of(); }
    }
    private void bind(PreparedStatement statement, int index, String value) throws SQLException {
        statement.setString(index, value == null ? "" : value);
    }
    private interface SqlBinder { Void bind(PreparedStatement statement) throws SQLException; }
}
