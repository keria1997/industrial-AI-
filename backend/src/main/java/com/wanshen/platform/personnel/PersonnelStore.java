package com.wanshen.platform.personnel;

import java.util.*;
import java.util.function.Supplier;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class PersonnelStore extends AbstractPersonnelStore {

    private final Map<String, Employee> employees = new ConcurrentHashMap<>();
    private final Map<String, Attendance> attendances = new ConcurrentHashMap<>();
    private final Map<String, Skill> skills = new ConcurrentHashMap<>();
    private final Map<String, OutboxEvent> outbox = new ConcurrentHashMap<>();
    private final List<AuditLog> auditLogs = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, IdempotencyRecord> idempotency = new ConcurrentHashMap<>();

    @Override
    public synchronized <T> T transaction(Supplier<T> work) { return work.get(); }

    @Override
    public synchronized Page<Employee> employees(
            String tenantId, Integer page, Integer pageSize, String status,
            String department, String search
    ) {
        List<Employee> values = employees.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> department == null || item.department().equals(department))
                .filter(item -> matches(search, item.employeeNo(), item.name(), item.department(), item.phone(), item.email()))
                .sorted(Comparator.comparing(Employee::createdAt).reversed())
                .collect(Collectors.toList());
        return page(values, page, pageSize);
    }

    @Override
    public synchronized Page<Attendance> attendances(
            String tenantId, Integer page, Integer pageSize, String status,
            String shift, String employeeId, String recordDate, String search
    ) {
        List<Attendance> values = attendances.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> shift == null || item.shift().equals(shift))
                .filter(item -> employeeId == null || item.employeeId().equals(employeeId))
                .filter(item -> recordDate == null || item.recordDate().equals(recordDate))
                .filter(item -> matches(search, item.recordNo(), item.employeeName(), item.recordDate()))
                .sorted(Comparator.comparing(Attendance::createdAt).reversed())
                .collect(Collectors.toList());
        return page(values, page, pageSize);
    }

    @Override
    public synchronized Page<Skill> skills(
            String tenantId, Integer page, Integer pageSize, String status,
            String level, String employeeId, String search
    ) {
        List<Skill> values = skills.values().stream()
                .filter(item -> item.tenantId().equals(tenantId))
                .filter(item -> status == null || item.status().equals(status))
                .filter(item -> level == null || item.level().equals(level))
                .filter(item -> employeeId == null || item.employeeId().equals(employeeId))
                .filter(item -> matches(search, item.certNo(), item.employeeName(), item.skillName(), item.issuer()))
                .sorted(Comparator.comparing(Skill::createdAt).reversed())
                .collect(Collectors.toList());
        return page(values, page, pageSize);
    }

    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }

    private boolean matches(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        return Arrays.stream(fields).filter(Objects::nonNull).anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }

    @Override
    public Optional<Employee> employee(String tenantId, String id) {
        return Optional.ofNullable(employees.get(tenantId + ":" + id));
    }

    @Override
    public Optional<Employee> employeeByNo(String tenantId, String employeeNo) {
        return employees.values().stream()
                .filter(item -> item.tenantId().equals(tenantId) && item.employeeNo().equals(employeeNo))
                .findFirst();
    }

    @Override
    public void saveEmployee(Employee value) { employees.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteEmployee(String tenantId, String id) { employees.remove(key(tenantId, id)); }

    @Override
    public Optional<Attendance> attendance(String tenantId, String id) {
        return Optional.ofNullable(attendances.get(key(tenantId, id)));
    }
    @Override
    public void saveAttendance(Attendance value) { attendances.put(key(value.tenantId(), value.id()), value); }

    @Override
    public Optional<Skill> skill(String tenantId, String id) {
        return Optional.ofNullable(skills.get(key(tenantId, id)));
    }
    @Override
    public void saveSkill(Skill value) { skills.put(key(value.tenantId(), value.id()), value); }
    @Override
    public void deleteSkill(String tenantId, String id) { skills.remove(key(tenantId, id)); }

    @Override
    public void addOutbox(OutboxEvent event) {
        outbox.put(key(event.tenantId(), event.eventId()), event);
    }

    @Override
    public synchronized List<OutboxEvent> pendingOutbox(String tenantId) {
        return outbox.values().stream()
                .filter(event -> "PENDING".equals(event.status()))
                .filter(event -> event.tenantId().equals(tenantId))
                .sorted(Comparator.comparing(OutboxEvent::createdAt))
                .toList();
    }

    @Override
    public synchronized List<String> pendingOutboxTenantIds() {
        return outbox.values().stream()
                .filter(event -> "PENDING".equals(event.status()))
                .map(OutboxEvent::tenantId)
                .distinct()
                .sorted()
                .toList();
    }

    @Override
    public synchronized void markOutboxPublished(String tenantId, String eventId) {
        OutboxEvent event = outbox.get(key(tenantId, eventId));
        if (event != null) {
            outbox.put(key(tenantId, eventId), new OutboxEvent(
                    event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                    event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                    event.payload(), "PUBLISHED", event.attempts(), event.lastError(), event.createdAt()
            ));
        }
    }

    @Override
    public synchronized void markOutboxFailed(String tenantId, String eventId, String error, int maxAttempts) {
        OutboxEvent event = outbox.get(key(tenantId, eventId));
        if (event == null) return;
        int attempts = event.attempts() + 1;
        String status = attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING";
        outbox.put(key(tenantId, eventId), new OutboxEvent(
                event.eventId(), event.tenantId(), event.eventType(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), event.correlationId(), event.traceId(),
                event.payload(), status, attempts, error, event.createdAt()
        ));
    }

    @Override
    public void addAuditLog(AuditLog log) {
        auditLogs.add(log);
    }

    @Override
    public Optional<IdempotencyRecord> idempotency(String tenantId, String commandType, String key) {
        return Optional.ofNullable(idempotency.get(key(tenantId, commandType, key)));
    }

    @Override
    public void saveIdempotency(
            String tenantId, String commandType, String key, String requestHash,
            int statusCode, Object body
    ) {
        idempotency.put(key(tenantId, commandType, key), new IdempotencyRecord(requestHash, statusCode, body));
    }

    private String key(String tenantId, String id) { return tenantId + ":" + id; }
    private String key(String tenantId, String commandType, String idempotencyKey) {
        return tenantId + ":" + commandType + ":" + idempotencyKey;
    }
}
