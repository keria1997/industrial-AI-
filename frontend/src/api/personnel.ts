import { apiRequest, type ApiContext } from './client';

// ===== Types =====
export type EmployeeStatus = 'active' | 'transferring' | 'leave' | 'resigned';
export type AttendanceShift = '早班' | '中班' | '晚班' | '休息';
export type AttendanceStatus = '正常' | '迟到' | '早退' | '缺勤' | '请假' | '加班';
export type SkillLevel = '初级' | '中级' | '高级' | '技师' | '高级技师';
export type SkillStatus = '有效' | '即将到期' | '已过期' | '已撤销';

export type EmployeeDto = {
  id: string; employeeNo: string; name: string;
  department: string; phone: string; email: string;
  status: EmployeeStatus; hireDate?: string; leaveDate?: string;
  metadata: Record<string, unknown>; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type AttendanceDto = {
  id: string; recordNo: string; employeeId: string; employeeName: string;
  recordDate: string; shift: AttendanceShift;
  clockIn?: string; clockOut?: string;
  status: AttendanceStatus; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type SkillDto = {
  id: string; certNo: string; employeeId: string; employeeName: string;
  skillName: string; level: SkillLevel;
  issueDate?: string; expiryDate?: string;
  status: SkillStatus; issuer: string;
  metadata: Record<string, unknown>; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type PersonnelDashboardDto = {
  totalEmployees: number; activeEmployees: number; onLeaveCount: number;
  todayAttendance: number; lateCount: number; absentCount: number;
  expiringCerts: number; expiredCerts: number;
  recentAttendances: AttendanceDto[];
  expiringSkills: SkillDto[];
};

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const personnelApi = {
  // ===== Employees =====
  listEmployees: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: EmployeeDto[]; total: number }>(`/api/v1/personnel/employees?${params.toString()}`, context);
  },
  getEmployee: (context: ApiContext, id: string) =>
    apiRequest<EmployeeDto>(`/api/v1/personnel/employees/${id}`, context),
  createEmployee: (context: ApiContext, input: { employeeNo: string; name: string; department?: string; phone?: string; email?: string; status?: string; hireDate?: string; remark?: string }) =>
    apiRequest<{ employee: EmployeeDto }>('/api/v1/personnel/employees', context, { method: 'POST', idempotencyKey: key(`hr-emp-create:${input.employeeNo}`), body: JSON.stringify(input) }),
  updateEmployee: (context: ApiContext, employee: EmployeeDto, input: Partial<{ name: string; department: string; phone: string; email: string; status: string; remark: string }>) =>
    apiRequest<{ employee: EmployeeDto }>(`/api/v1/personnel/employees/${employee.id}`, context, { method: 'PATCH', expectedVersion: employee.version, idempotencyKey: key(`hr-emp-update:${employee.id}`), body: JSON.stringify(input) }),
  deleteEmployee: (context: ApiContext, employee: EmployeeDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/personnel/employees/${employee.id}`, context, { method: 'DELETE', expectedVersion: employee.version, idempotencyKey: key(`hr-emp-delete:${employee.id}`) }),

  // ===== Attendances =====
  listAttendances: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string; employeeId?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: AttendanceDto[]; total: number }>(`/api/v1/personnel/attendances?${params.toString()}`, context);
  },
  getAttendance: (context: ApiContext, id: string) =>
    apiRequest<AttendanceDto>(`/api/v1/personnel/attendances/${id}`, context),
  createAttendance: (context: ApiContext, input: { employeeId: string; employeeName: string; recordDate: string; shift?: string; clockIn?: string; clockOut?: string; status?: string; remark?: string }) =>
    apiRequest<{ attendance: AttendanceDto }>('/api/v1/personnel/attendances', context, { method: 'POST', idempotencyKey: key('hr-att-create'), body: JSON.stringify(input) }),
  updateAttendance: (context: ApiContext, attendance: AttendanceDto, input: Partial<{ shift: string; clockIn: string; clockOut: string; status: string; remark: string }>) =>
    apiRequest<{ attendance: AttendanceDto }>(`/api/v1/personnel/attendances/${attendance.id}`, context, { method: 'PATCH', expectedVersion: attendance.version, idempotencyKey: key(`hr-att-update:${attendance.id}`), body: JSON.stringify(input) }),

  // ===== Skills =====
  listSkills: (context: ApiContext, filter?: { page?: number; pageSize?: number; search?: string; status?: string; employeeId?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: SkillDto[]; total: number }>(`/api/v1/personnel/skills?${params.toString()}`, context);
  },
  getSkill: (context: ApiContext, id: string) =>
    apiRequest<SkillDto>(`/api/v1/personnel/skills/${id}`, context),
  createSkill: (context: ApiContext, input: { certNo: string; employeeId: string; employeeName: string; skillName: string; level?: string; issueDate?: string; expiryDate?: string; issuer?: string; remark?: string }) =>
    apiRequest<{ skill: SkillDto }>('/api/v1/personnel/skills', context, { method: 'POST', idempotencyKey: key(`hr-skill-create:${input.certNo}`), body: JSON.stringify(input) }),
  updateSkill: (context: ApiContext, skill: SkillDto, input: Partial<{ skillName: string; level: string; issueDate: string; expiryDate: string; status: string; issuer: string; remark: string }>) =>
    apiRequest<{ skill: SkillDto }>(`/api/v1/personnel/skills/${skill.id}`, context, { method: 'PATCH', expectedVersion: skill.version, idempotencyKey: key(`hr-skill-update:${skill.id}`), body: JSON.stringify(input) }),
  renewSkill: (context: ApiContext, skill: SkillDto, input: { newExpiryDate: string; newIssueDate?: string; remark?: string }) =>
    apiRequest<{ skill: SkillDto }>(`/api/v1/personnel/skills/${skill.id}/renew`, context, { method: 'POST', expectedVersion: skill.version, idempotencyKey: key(`hr-skill-renew:${skill.id}`), body: JSON.stringify(input) }),

  // ===== Dashboard =====
  getDashboard: (context: ApiContext) =>
    apiRequest<PersonnelDashboardDto>('/api/v1/personnel/dashboard', context),
};
