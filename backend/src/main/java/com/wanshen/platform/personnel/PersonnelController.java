package com.wanshen.platform.personnel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Attendance;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Employee;
import com.wanshen.platform.personnel.AbstractPersonnelStore.AuditLog;
import com.wanshen.platform.personnel.AbstractPersonnelStore.IdempotencyRecord;
import com.wanshen.platform.personnel.AbstractPersonnelStore.OutboxEvent;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Page;
import com.wanshen.platform.personnel.AbstractPersonnelStore.Skill;
import com.wanshen.platform.web.ApiException;
import com.wanshen.platform.web.RequestContextService;
import com.wanshen.platform.web.RequestContextService.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/v1/personnel")
@ConditionalOnProperty(value = "app.personnel.native-enabled", havingValue = "true")
public class PersonnelController {
    private final AbstractPersonnelStore store;
    private final RequestContextService contexts;
    private final ObjectMapper objectMapper;

    public PersonnelController(
            AbstractPersonnelStore store,
            RequestContextService contexts,
            ObjectMapper objectMapper
    ) {
        this.store = store;
        this.contexts = contexts;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/employees")
    public Page<Employee> employees(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String search
    ) {
        require(context(request), "hr.employee.read");
        validatePage(page, pageSize);
        return store.employees(context(request).tenantId(), page, pageSize, status, department, search);
    }

    @GetMapping("/employees/{id}")
    public ResponseEntity<Employee> employee(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.employee.read");
        validateUuid(id);
        Employee value = store.employee(context.tenantId(), id)
                .orElseThrow(() -> notFound("员工不存在", "刷新员工列表后重试"));
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/employees")
    public ResponseEntity<?> createEmployee(@RequestBody Employee value, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.employee.create");
        validateEmployeeCreate(value);
        return command(context, "hr.employee.create", value, 201, () -> {
            if (store.employeeByNo(context.tenantId(), value.employeeNo()).isPresent()) {
                throw new ApiException(409, "PRODUCTION_409_ILLEGAL_STATE", "工号已存在", "使用不同的工号");
            }
            String id = UUID.randomUUID().toString();
            String timestamp = Instant.now().toString();
            Employee employee = new Employee(
                    id, context.tenantId(), value.employeeNo(), value.name(), value.department(),
                    value.phone(), value.email(), value.status() == null ? "active" : value.status(),
                    value.hireDate(), null, value.metadata() == null ? Map.of() : value.metadata(),
                    value.remark() == null ? "" : value.remark(), 1, timestamp, timestamp, context.actorId()
            );
            store.saveEmployee(employee);
            return mutation(Map.of("employee", employee), "Employee", id, 1,
                    "CREATE", null, employee, "hr.employee.created.v1",
                    Map.of("employeeId", id, "employeeNo", value.employeeNo()));
        });
    }

    @PatchMapping("/employees/{id}")
    public ResponseEntity<?> updateEmployee(@PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.employee.update");
        validatePatch(patch, "name", "department", "phone", "email", "status", "hireDate", "leaveDate", "metadata", "remark");
        validateUuid(id);
        return command(context, "hr.employee.update", Map.of("id", id, "patch", patch), 200, () -> {
            Employee current = store.employee(context.tenantId(), id)
                    .orElseThrow(() -> notFound("员工不存在", "刷新员工列表后重试"));
            requireVersion(context, current.version());
            Employee updated = new Employee(
                    current.id(), current.tenantId(), current.employeeNo(),
                    text(patch, "name", current.name()),
                    text(patch, "department", current.department()),
                    text(patch, "phone", current.phone()),
                    text(patch, "email", current.email()),
                    text(patch, "status", current.status()),
                    text(patch, "hireDate", current.hireDate()),
                    text(patch, "leaveDate", current.leaveDate()),
                    patch.has("metadata") ? objectMapper.convertValue(patch.get("metadata"), Map.class) : current.metadata(),
                    text(patch, "remark", current.remark()),
                    current.version() + 1, current.createdAt(), Instant.now().toString(), current.createdBy()
            );
            store.saveEmployee(updated);
            return mutation(Map.of("employee", updated), "Employee", id, updated.version(),
                    "UPDATE", current, updated, "hr.employee.updated.v1", Map.of("employeeId", id));
        });
    }

    @DeleteMapping("/employees/{id}")
    public ResponseEntity<?> deleteEmployee(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.employee.delete");
        validateUuid(id);
        return command(context, "hr.employee.delete", Map.of("id", id), 200, () -> {
            Employee current = store.employee(context.tenantId(), id)
                    .orElseThrow(() -> notFound("员工不存在", "刷新员工列表后重试"));
            requireVersion(context, current.version());
            store.deleteEmployee(context.tenantId(), id);
            return mutation(Map.of("deleted", true), "Employee", id, current.version(),
                    "DELETE", current, null, "hr.employee.deleted.v1", Map.of("employeeId", id));
        });
    }

    @GetMapping("/attendances")
    public Page<Attendance> attendances(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String shift,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String recordDate,
            @RequestParam(required = false) String search
    ) {
        require(context(request), "hr.attendance.read");
        validatePage(page, pageSize);
        return store.attendances(context(request).tenantId(), page, pageSize, status, shift, employeeId, recordDate, search);
    }

    @GetMapping("/attendances/{id}")
    public ResponseEntity<Attendance> attendance(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.attendance.read");
        validateUuid(id);
        Attendance value = store.attendance(context.tenantId(), id)
                .orElseThrow(() -> notFound("考勤记录不存在", "刷新考勤列表后重试"));
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/attendances")
    public ResponseEntity<?> createAttendance(@RequestBody Attendance value, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.attendance.create");
        validateAttendanceCreate(value);
        return command(context, "hr.attendance.create", value, 201, () -> {
            String id = UUID.randomUUID().toString();
            String timestamp = Instant.now().toString();
            Attendance attendance = new Attendance(
                    id, context.tenantId(), "ATT-" + datePart() + "-" + shortId(),
                    value.employeeId(), value.employeeName(), value.recordDate(), value.shift(),
                    value.clockIn(), value.clockOut(), value.status() == null ? "正常" : value.status(),
                    value.remark() == null ? "" : value.remark(), 1, timestamp, timestamp, context.actorId()
            );
            store.saveAttendance(attendance);
            return mutation(Map.of("attendance", attendance), "Attendance", id, 1,
                    "CREATE", null, attendance, "hr.attendance.created.v1",
                    Map.of("attendanceId", id, "employeeId", value.employeeId(), "recordDate", value.recordDate()));
        });
    }

    @PatchMapping("/attendances/{id}")
    public ResponseEntity<?> updateAttendance(@PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.attendance.update");
        validatePatch(patch, "shift", "clockIn", "clockOut", "status", "remark");
        validateUuid(id);
        return command(context, "hr.attendance.update", Map.of("id", id, "patch", patch), 200, () -> {
            Attendance current = store.attendance(context.tenantId(), id)
                    .orElseThrow(() -> notFound("考勤记录不存在", "刷新考勤列表后重试"));
            requireVersion(context, current.version());
            Attendance updated = new Attendance(
                    current.id(), current.tenantId(), current.recordNo(), current.employeeId(), current.employeeName(),
                    current.recordDate(), text(patch, "shift", current.shift()), text(patch, "clockIn", current.clockIn()),
                    text(patch, "clockOut", current.clockOut()), text(patch, "status", current.status()),
                    text(patch, "remark", current.remark()), current.version() + 1, current.createdAt(),
                    Instant.now().toString(), current.createdBy()
            );
            store.saveAttendance(updated);
            return mutation(Map.of("attendance", updated), "Attendance", id, updated.version(),
                    "UPDATE", current, updated, null, Map.of());
        });
    }

    @GetMapping("/skills")
    public Page<Skill> skills(
            HttpServletRequest request,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String employeeId,
            @RequestParam(required = false) String search
    ) {
        require(context(request), "hr.skill.read");
        validatePage(page, pageSize);
        return store.skills(context(request).tenantId(), page, pageSize, status, level, employeeId, search);
    }

    @GetMapping("/skills/{id}")
    public ResponseEntity<Skill> skill(@PathVariable String id, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.skill.read");
        validateUuid(id);
        Skill value = store.skill(context.tenantId(), id)
                .orElseThrow(() -> notFound("技能证书不存在", "刷新技能列表后重试"));
        return ResponseEntity.ok().eTag("\"" + value.version() + "\"").body(value);
    }

    @PostMapping("/skills")
    public ResponseEntity<?> createSkill(@RequestBody Skill value, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.skill.create");
        validateSkillCreate(value);
        return command(context, "hr.skill.create", value, 201, () -> {
            String id = UUID.randomUUID().toString();
            String timestamp = Instant.now().toString();
            Skill skill = new Skill(
                    id, context.tenantId(), "CERT-" + datePart() + "-" + shortId(),
                    value.employeeId(), value.employeeName(), value.skillName(), value.level(),
                    value.issueDate(), value.expiryDate(), skillStatus(value.expiryDate()), value.issuer(),
                    value.metadata() == null ? Map.of() : value.metadata(),
                    value.remark() == null ? "" : value.remark(), 1, timestamp, timestamp, context.actorId()
            );
            store.saveSkill(skill);
            return mutation(Map.of("skill", skill), "Skill", id, 1,
                    "CREATE", null, skill, "hr.skill.created.v1",
                    Map.of("skillId", id, "employeeId", value.employeeId(), "skillName", value.skillName()));
        });
    }

    @PatchMapping("/skills/{id}")
    public ResponseEntity<?> updateSkill(@PathVariable String id, @RequestBody JsonNode patch, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.skill.update");
        validatePatch(patch, "skillName", "level", "issueDate", "expiryDate", "status", "issuer", "metadata", "remark");
        validateUuid(id);
        return command(context, "hr.skill.update", Map.of("id", id, "patch", patch), 200, () -> {
            Skill current = store.skill(context.tenantId(), id)
                    .orElseThrow(() -> notFound("技能证书不存在", "刷新技能列表后重试"));
            requireVersion(context, current.version());
            String expiry = text(patch, "expiryDate", current.expiryDate());
            Skill updated = new Skill(
                    current.id(), current.tenantId(), current.certNo(), current.employeeId(), current.employeeName(),
                    text(patch, "skillName", current.skillName()), text(patch, "level", current.level()),
                    text(patch, "issueDate", current.issueDate()), expiry,
                    patch.has("expiryDate") ? skillStatus(expiry) : text(patch, "status", current.status()),
                    text(patch, "issuer", current.issuer()),
                    patch.has("metadata") ? objectMapper.convertValue(patch.get("metadata"), Map.class) : current.metadata(),
                    text(patch, "remark", current.remark()), current.version() + 1,
                    current.createdAt(), Instant.now().toString(), current.createdBy()
            );
            store.saveSkill(updated);
            return mutation(Map.of("skill", updated), "Skill", id, updated.version(),
                    "UPDATE", current, updated, null, Map.of());
        });
    }

    @PostMapping("/skills/{id}/renew")
    public ResponseEntity<?> renewSkill(@PathVariable String id, @RequestBody JsonNode body, HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.skill.renew");
        validateUuid(id);
        String expiry = body.path("newExpiryDate").asText();
        requireText(expiry, "newExpiryDate", 20);
        return command(context, "hr.skill.renew", Map.of("id", id, "newExpiryDate", expiry), 200, () -> {
            Skill current = store.skill(context.tenantId(), id)
                    .orElseThrow(() -> notFound("技能证书不存在", "刷新技能列表后重试"));
            requireVersion(context, current.version());
            Skill updated = new Skill(
                    current.id(), current.tenantId(), current.certNo(), current.employeeId(), current.employeeName(),
                    current.skillName(), current.level(), current.issueDate(), expiry, skillStatus(expiry),
                    current.issuer(), current.metadata(), current.remark(), current.version() + 1,
                    current.createdAt(), Instant.now().toString(), current.createdBy()
            );
            store.saveSkill(updated);
            return mutation(Map.of("skill", updated), "Skill", id, updated.version(),
                    "RENEW", current, updated, "hr.skill.renewed.v1",
                    Map.of("skillId", id, "newExpiryDate", expiry));
        });
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        RequestContext context = context(request);
        require(context, "hr.employee.read");
        Page<Employee> employees = store.employees(context.tenantId(), 1, 1000, null, null, null);
        String today = LocalDate.now().toString();
        Page<Attendance> attendances = store.attendances(context.tenantId(), 1, 1000, null, null, null, today, null);
        Page<Skill> skills = store.skills(context.tenantId(), 1, 1000, null, null, null, null);
        return Map.of(
                "totalEmployees", employees.total(),
                "activeEmployees", employees.items().stream().filter(item -> "active".equals(item.status())).count(),
                "onLeaveCount", employees.items().stream().filter(item -> "leave".equals(item.status())).count(),
                "todayAttendance", attendances.total(),
                "lateCount", attendances.items().stream().filter(item -> "迟到".equals(item.status())).count(),
                "absentCount", attendances.items().stream().filter(item -> "缺勤".equals(item.status())).count(),
                "expiringCerts", skills.items().stream().filter(item -> "即将到期".equals(item.status())).count(),
                "expiredCerts", skills.items().stream().filter(item -> "已过期".equals(item.status())).count(),
                "recentAttendances", attendances.items().stream().limit(10).toList(),
                "expiringSkills", skills.items().stream().filter(item -> "即将到期".equals(item.status())).toList()
        );
    }

    private record Mutation(
            Object body,
            String aggregateType,
            String aggregateId,
            int aggregateVersion,
            String action,
            Object before,
            Object after,
            String eventType,
            Map<String, Object> payload
    ) {}

    private Mutation mutation(
            Object body,
            String aggregateType,
            String aggregateId,
            int aggregateVersion,
            String action,
            Object before,
            Object after,
            String eventType,
            Map<String, Object> payload
    ) {
        return new Mutation(
                body, aggregateType, aggregateId, aggregateVersion, action,
                before, after, eventType, payload
        );
    }

    private ResponseEntity<?> command(
            RequestContext context,
            String type,
            Object input,
            int status,
            Supplier<Mutation> work
    ) {
        if (context.idempotencyKey() == null || context.idempotencyKey().isBlank()) {
            throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
        }
        String hash = hash(input);

        return store.transaction(() -> {
            Optional<IdempotencyRecord> replay = store.idempotency(context.tenantId(), type, context.idempotencyKey());
            if (replay.isPresent()) {
                if (!replay.get().requestHash().equals(hash)) {
                    throw new ApiException(409, "PRODUCTION_409_IDEMPOTENCY_CONFLICT", "幂等键已用于不同请求", "为新业务操作使用新的幂等键");
                }
                return replayResponse(context, replay.get());
            }

            Mutation mutation = work.get();
            store.addAuditLog(new AuditLog(
                    UUID.randomUUID().toString(), context.tenantId(), mutation.aggregateType(),
                    mutation.aggregateId(), mutation.aggregateVersion(), mutation.action(),
                    context.actorId(), mutation.before(), mutation.after(),
                    UUID.randomUUID().toString(), context.traceId(), Instant.now().toString()
            ));
            if (mutation.eventType() != null) {
                store.addOutbox(new OutboxEvent(
                        UUID.randomUUID().toString(), context.tenantId(), mutation.eventType(),
                        mutation.aggregateType(), mutation.aggregateId(), mutation.aggregateVersion(),
                        UUID.randomUUID().toString(), context.traceId(), mutation.payload(),
                        "PENDING", 0, "", Instant.now().toString()
                ));
            }
            store.saveIdempotency(context.tenantId(), type, context.idempotencyKey(), hash, status, mutation.body());
            ResponseEntity.BodyBuilder response = ResponseEntity.status(status)
                    .header("X-Trace-Id", context.traceId());
            if (mutation.after() != null) {
                response = response.eTag("\"" + mutation.aggregateVersion() + "\"");
            }
            return response.body(mutation.body());
        });
    }

    private ResponseEntity<?> replayResponse(RequestContext context, IdempotencyRecord record) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(record.statusCode())
                .header("X-Trace-Id", context.traceId())
                .header("X-Idempotent-Replay", "true");
        Integer version = aggregateVersion(record.body());
        if (version != null) response = response.eTag("\"" + version + "\"");
        return response.body(record.body());
    }

    private Integer aggregateVersion(Object body) {
        if (!(body instanceof Map<?, ?> map)) return null;
        Object value = map.containsKey("employee") ? map.get("employee")
                : map.containsKey("attendance") ? map.get("attendance")
                : map.containsKey("skill") ? map.get("skill") : null;
        return value instanceof AbstractPersonnelStore.Employee employee ? employee.version()
                : value instanceof AbstractPersonnelStore.Attendance attendance ? attendance.version()
                : value instanceof AbstractPersonnelStore.Skill skill ? skill.version()
                : null;
    }

    private void require(RequestContext context, String permission) {
        if (!context.has(permission)) {
            throw new ApiException(403, "PRODUCTION_403_PERMISSION_DENIED", "缺少操作权限：" + permission, "请联系管理员授予对应人事权限");
        }
    }

    private void validatePage(Integer page, Integer pageSize) {
        if (page != null && page < 1) invalidArgument("页码必须大于等于 1");
        if (pageSize != null && (pageSize < 1 || pageSize > 200)) invalidArgument("每页数量必须在 1-200 之间");
    }

    private void validateEmployeeCreate(Employee value) {
        requireText(value.employeeNo(), "employeeNo", 100);
        requireText(value.name(), "name", 200);
        requireText(value.department(), "department", 200);
        requireText(value.phone(), "phone", 50);
        requireText(value.email(), "email", 200);
        if (value.status() != null && !Set.of("active", "transferring", "leave", "resigned").contains(value.status())) {
            invalidArgument("status 不合法");
        }
        validateOptionalText(value.hireDate(), "hireDate", 20);
        validateObject(value.metadata(), "metadata");
        validateOptionalText(value.remark(), "remark", 500);
    }

    private void validateAttendanceCreate(Attendance value) {
        validateUuid(value.employeeId());
        requireText(value.employeeName(), "employeeName", 200);
        requireText(value.recordDate(), "recordDate", 20);
        requireText(value.shift(), "shift", 20);
        if (!Set.of("早班", "中班", "晚班", "休息").contains(value.shift())) invalidArgument("shift 不合法");
        validateOptionalText(value.clockIn(), "clockIn", 20);
        validateOptionalText(value.clockOut(), "clockOut", 20);
        if (value.status() != null && !Set.of("正常", "迟到", "早退", "缺勤", "请假", "加班").contains(value.status())) {
            invalidArgument("status 不合法");
        }
        validateOptionalText(value.remark(), "remark", 500);
    }

    private void validateSkillCreate(Skill value) {
        validateUuid(value.employeeId());
        requireText(value.employeeName(), "employeeName", 200);
        requireText(value.skillName(), "skillName", 200);
        requireText(value.level(), "level", 20);
        if (!Set.of("初级", "中级", "高级", "技师", "高级技师").contains(value.level())) invalidArgument("level 不合法");
        validateOptionalText(value.issueDate(), "issueDate", 20);
        validateOptionalText(value.expiryDate(), "expiryDate", 20);
        requireText(value.issuer(), "issuer", 200);
        validateObject(value.metadata(), "metadata");
        validateOptionalText(value.remark(), "remark", 500);
    }

    private void validatePatch(JsonNode patch, String... allowedFields) {
        if (patch == null || !patch.isObject() || patch.isEmpty()) {
            invalidArgument("至少提供一个更新字段");
        }
        for (String field : allowedFields) {
            if (!patch.has(field)) continue;
            JsonNode value = patch.get(field);
            if (field.equals("metadata")) {
                validateObject(value, field);
            } else if (value == null || !value.isTextual()) {
                invalidArgument(field + " 不合法");
            } else if (field.equals("status") && !value.asText().isBlank()) {
                if (Set.of("active", "transferring", "leave", "resigned").contains(value.asText())) continue;
                if (Set.of("正常", "迟到", "早退", "缺勤", "请假", "加班").contains(value.asText())) continue;
                if (Set.of("有效", "即将到期", "已过期", "已撤销").contains(value.asText())) continue;
                invalidArgument("status 不合法");
            } else if (field.equals("shift") && !Set.of("早班", "中班", "晚班", "休息").contains(value.asText())) {
                invalidArgument("shift 不合法");
            } else if (field.equals("level") && !Set.of("初级", "中级", "高级", "技师", "高级技师").contains(value.asText())) {
                invalidArgument("level 不合法");
            } else if (!field.equals("status") && (value.asText().isBlank() || value.asText().length() > 500)) {
                invalidArgument(field + " 不合法");
            }
        }
    }

    private void requireText(String value, String field, int maxLength) {
        if (value == null || value.isBlank() || value.length() > maxLength) invalidArgument(field + " 不合法");
    }

    private void validateOptionalText(String value, String field, int maxLength) {
        if (value != null && (value.length() > maxLength)) invalidArgument(field + " 不合法");
    }

    private void validateObject(JsonNode value, String field) {
        if (value != null && !value.isObject()) invalidArgument(field + " 必须是对象");
    }

    private void validateObject(Map<String, Object> value, String field) {
        if (value == null) return;
    }

    private void validateUuid(String value) {
        if (value == null || value.isBlank()) return;
        try {
            UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            invalidArgument("ID 必须是 UUID");
        }
    }

    private void invalidArgument(String message) {
        throw new ApiException(400, "PRODUCTION_400_INVALID_ARGUMENT", message, "检查请求字段后重试");
    }

    private void requireVersion(RequestContext context, int actual) {
        if (context.expectedVersion() == null) {
            throw new ApiException(
                    409, "PRODUCTION_409_VERSION_CONFLICT", "缺少聚合版本", "刷新数据并携带最新 If-Match 后重试",
                    List.of(), new LinkedHashMap<>(Map.of("actualVersion", actual))
            );
        }
        if (context.expectedVersion() != actual) {
            throw new ApiException(
                    409, "PRODUCTION_409_VERSION_CONFLICT", "数据已被其他操作更新", "刷新数据后重新确认操作",
                    List.of(), new LinkedHashMap<>(Map.of(
                            "expectedVersion", context.expectedVersion(), "actualVersion", actual
                    ))
            );
        }
    }

    private ApiException notFound(String message, String suggestion) {
        return new ApiException(404, "PRODUCTION_404_NOT_FOUND", message, suggestion);
    }

    private String skillStatus(String expiryDate) {
        if (expiryDate == null) return "有效";
        Instant expiry = parseDate(expiryDate);
        Instant now = Instant.now();
        if (now.isAfter(expiry)) return "已过期";
        if (now.plusSeconds(30L * 24 * 60 * 60).isAfter(expiry)) return "即将到期";
        return "有效";
    }

    private Instant parseDate(String value) {
        return value.matches("\\d{4}-\\d{2}-\\d{2}")
                ? LocalDate.parse(value).atStartOfDay(java.time.ZoneOffset.UTC).toInstant()
                : Instant.parse(value);
    }

    private String text(JsonNode patch, String field, String fallback) {
        return patch.has(field) ? patch.get(field).asText() : fallback;
    }

    private String hash(Object value) {
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(value);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String datePart() { return LocalDate.now().toString().replace("-", ""); }
    private String shortId() { return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(); }
    private RequestContext context(HttpServletRequest request) {
        return contexts.from(request);
    }
}
