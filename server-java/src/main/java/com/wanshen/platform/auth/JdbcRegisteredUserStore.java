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
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO registered_users
                  (account, password_hash, name, phone, email, tenant_id, tenant_name, industry,
                   is_tenant_admin, first_login, department, position, employee_no, role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?)
                RETURNING *
                """)) {
            bind(statement, 1, input.account()); bind(statement, 2, input.encodedPassword());
            bind(statement, 3, input.name()); bind(statement, 4, input.phone());
            bind(statement, 5, input.email()); bind(statement, 6, tenantId);
            bind(statement, 7, input.tenantName()); bind(statement, 8, input.industry());
            statement.setBoolean(9, input.isTenantAdmin());
            bind(statement, 10, input.department()); bind(statement, 11, input.position());
            bind(statement, 12, input.employeeNo()); bind(statement, 13, input.role());
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return map(result);
            }
        } catch (SQLException exception) {
            String message = exception.getMessage() == null ? "" : exception.getMessage().toLowerCase();
            if (message.contains("account")) throw new DuplicateAccountException();
            if (message.contains("phone")) throw new DuplicatePhoneException();
            if (message.contains("email")) throw new DuplicateEmailException();
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
        return first("SELECT * FROM registered_users WHERE id = ?", id);
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
        update("UPDATE registered_users SET password_hash = ? WHERE account = ?", statement -> {
            statement.setString(1, encodedPassword); statement.setString(2, account); return null;
        });
    }
    @Override
    public void updateUserStatus(String id, String status) {
        update("UPDATE registered_users SET status = ? WHERE id = ?", statement -> {
            statement.setString(1, status); statement.setString(2, id); return null;
        });
    }
    @Override
    public void updateFirstLogin(String account, boolean value) {
        update("UPDATE registered_users SET first_login = ? WHERE account = ?", statement -> {
            statement.setBoolean(1, value); statement.setString(2, account); return null;
        });
    }
    @Override
    public String generateSmsCode(String phone) {
        String code = String.valueOf((int) Math.floor(100000 + Math.random() * 900000));
        update("INSERT INTO sms_codes (phone, code, expires_at) VALUES (?, ?, ?)", statement -> {
            statement.setString(1, phone); statement.setString(2, code);
            statement.setTimestamp(3, Timestamp.from(Instant.now().plusSeconds(300))); return null;
        });
        return code;
    }
    @Override
    public boolean verifySmsCode(String phone, String code) {
        return update("UPDATE sms_codes SET used = TRUE WHERE phone = ? AND code = ? AND used = FALSE AND expires_at > now()", statement -> {
            statement.setString(1, phone); statement.setString(2, code); return null;
        }) > 0;
    }
    @Override
    public String generateResetToken(String email) {
        String token = UUID.randomUUID().toString().replace("-", "");
        update("INSERT INTO password_reset_tokens (token, email, expires_at) VALUES (?, ?, ?)", statement -> {
            statement.setString(1, token); statement.setString(2, email);
            statement.setTimestamp(3, Timestamp.from(Instant.now().plusSeconds(1800))); return null;
        });
        return token;
    }
    @Override
    public ResetToken verifyResetToken(String token) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "SELECT email FROM password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > now()")) {
            statement.setString(1, token);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? new ResetToken(token, result.getString(1)) : null;
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }
    @Override
    public void markResetTokenUsed(String token) {
        update("UPDATE password_reset_tokens SET used = TRUE WHERE token = ?", statement -> {
            statement.setString(1, token); return null;
        });
    }
    @Override
    public void revokeSession(String tenantId, String account) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO module_document (module, tenant_id, kind, doc_id, data)
                    VALUES ('auth', ?, 'sessionRevocation', ?, ?::jsonb)
                    ON CONFLICT (module, tenant_id, kind, doc_id) DO NOTHING
                    """)) {
                statement.setString(1, tenantId);
                statement.setString(2, account + ":logout");
                statement.setString(3, "{\"account\":\"" + account.replace("\"", "") + "\",\"reason\":\"logout\"}");
                statement.executeUpdate();
                connection.commit();
            } catch (Exception exception) {
                connection.rollback(); throw new IllegalStateException(exception);
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }
    @Override
    public boolean isSessionRevoked(String tenantId, String account) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            bindTenant(connection, tenantId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT 1 FROM module_document WHERE module = 'auth' AND tenant_id = ? AND kind = 'sessionRevocation' AND doc_id = ?")) {
                statement.setString(1, tenantId); statement.setString(2, account + ":logout");
                try (ResultSet result = statement.executeQuery()) {
                    connection.commit();
                    return result.next();
                }
            } catch (Exception exception) {
                connection.rollback(); throw new IllegalStateException(exception);
            }
        } catch (SQLException exception) { return false; }
    }

    private List<RegisteredUser> query(String sql, SqlBinder binder) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            try (ResultSet result = statement.executeQuery()) {
                List<RegisteredUser> users = new ArrayList<>();
                while (result.next()) users.add(map(result));
                return users;
            }
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
    }
    private Optional<RegisteredUser> first(String sql, String value) {
        return query(sql, statement -> { statement.setString(1, value); return null; }).stream().findFirst();
    }
    private int update(String sql, SqlBinder binder) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            return statement.executeUpdate();
        } catch (SQLException exception) { throw new IllegalStateException(exception); }
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
                readPermissions(row), row.getTimestamp("created_at").toInstant().toString());
    }
    private List<String> readPermissions(ResultSet row) throws SQLException {
        try { return objectMapper.readValue(row.getString("permissions"), objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)); }
        catch (Exception exception) { return List.of("*"); }
    }
    private void bind(PreparedStatement statement, int index, String value) throws SQLException {
        statement.setString(index, value == null ? "" : value);
    }
    private interface SqlBinder { Void bind(PreparedStatement statement) throws SQLException; }
}
