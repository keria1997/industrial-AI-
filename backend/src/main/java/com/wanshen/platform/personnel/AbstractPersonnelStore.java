package com.wanshen.platform.personnel;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

public abstract class AbstractPersonnelStore {
    public record Employee(
            String id, String tenantId, String employeeNo, String name, String department,
            String position, String phone, String email, String status,
            @JsonInclude(JsonInclude.Include.NON_NULL) String hireDate,
            @JsonInclude(JsonInclude.Include.NON_NULL) String leaveDate,
            Map<String, Object> metadata, String remark, int version,
            String createdAt, String updatedAt, String createdBy
    ) {}

    public record Attendance(
            String id, String tenantId, String recordNo, String employeeId, String employeeName,
            String recordDate, String shift,
            @JsonInclude(JsonInclude.Include.NON_NULL) String clockIn,
            @JsonInclude(JsonInclude.Include.NON_NULL) String clockOut,
            String status, String remark, int version, String createdAt, String updatedAt, String createdBy
    ) {}

    public record Skill(
            String id, String tenantId, String certNo, String employeeId, String employeeName,
            String skillName, String level,
            @JsonInclude(JsonInclude.Include.NON_NULL) String issueDate,
            @JsonInclude(JsonInclude.Include.NON_NULL) String expiryDate,
            String status, String issuer, Map<String, Object> metadata, String remark, int version,
            String createdAt, String updatedAt, String createdBy
    ) {}

    public record OutboxEvent(
            String eventId, String tenantId, String eventType, String aggregateType,
            String aggregateId, int aggregateVersion, String correlationId, String traceId,
            Map<String, Object> payload, String status, int attempts, String lastError,
            String createdAt
    ) {}

    public record AuditLog(
            String id, String tenantId, String aggregateType, String aggregateId,
            int aggregateVersion, String action, String actorId, Object before,
            Object after, String correlationId, String traceId, String occurredAt
    ) {}

    public record Page<T>(List<T> items, int total) {}
    public record IdempotencyRecord(String requestHash, int statusCode, Object body) {}

    public abstract <T> T transaction(Supplier<T> work);
    public abstract Page<Employee> employees(
            String tenantId, Integer page, Integer pageSize, String status,
            String department, String position, String search
    );
    public abstract Optional<Employee> employee(String tenantId, String id);
    public abstract Optional<Employee> employeeByNo(String tenantId, String employeeNo);
    public abstract void saveEmployee(Employee value);
    public abstract void deleteEmployee(String tenantId, String id);
    public abstract Page<Attendance> attendances(
            String tenantId, Integer page, Integer pageSize, String status, String shift,
            String employeeId, String recordDate, String search
    );
    public abstract Optional<Attendance> attendance(String tenantId, String id);
    public abstract void saveAttendance(Attendance value);
    public abstract Page<Skill> skills(
            String tenantId, Integer page, Integer pageSize, String status, String level,
            String employeeId, String search
    );
    public abstract Optional<Skill> skill(String tenantId, String id);
    public abstract void saveSkill(Skill value);
    public abstract void deleteSkill(String tenantId, String id);
    public abstract void addOutbox(OutboxEvent event);
    public abstract List<OutboxEvent> pendingOutbox(String tenantId);
    public abstract List<String> pendingOutboxTenantIds();
    public abstract void markOutboxPublished(String tenantId, String eventId);
    public abstract void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts);
    public abstract void addAuditLog(AuditLog log);
    public abstract Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key);
    public abstract void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    );
}
