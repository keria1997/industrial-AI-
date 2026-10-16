import { apiRequest, type ApiContext } from "./client";

export type AuthenticatedUser = {
  account: string;
  name: string;
  role: string;
  tenantIds: string[];
  tenantName?: string;
  permissions: string[];
  permissionVersion: string;
  accessToken: string;
  expiresAt: string;
  loginAt: string;
  loginType: "account";
  permissionSource: string;
  firstLogin?: boolean;
};

type SessionResponse = {
  accessToken: string;
  expiresAt: string;
  tokenType: "Bearer";
  user: Omit<AuthenticatedUser, "accessToken" | "expiresAt" | "loginAt" | "loginType" | "permissionSource">;
};

const SESSION_KEY = "industrial-ai-session:v2";

export type LoginCaptcha = {
  captchaId: string;
  image: string;
  expiresIn: number;
};

export async function requestLoginCaptcha(): Promise<LoginCaptcha> {
  return apiRequest<LoginCaptcha>("/api/v1/session/captcha", null, { method: "POST" });
}

export async function loginWithPassword(input: {
  account: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}): Promise<AuthenticatedUser> {
  const response = await apiRequest<SessionResponse & { firstLogin?: boolean }>("/api/v1/session/login", null, {
    method: "POST",
    body: JSON.stringify({
      account: input.account,
      password: input.password,
      captchaId: input.captchaId,
      captchaCode: input.captchaCode,
    }),
  });
  return {
    ...response.user,
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    loginAt: new Date().toISOString(),
    loginType: "account",
    permissionSource: "工业 AI 平台签名会话",
    firstLogin: response.firstLogin,
  };
}

export type EmployeeAccount = {
  id: string;
  account: string;
  name: string;
  phone: string;
  email: string;
  department?: string;
  position?: string;
  employeeNo?: string;
  role: string;
  isTenantAdmin: boolean;
  firstLogin: boolean;
  status: 'active' | 'disabled';
  createdAt: string;
};

export async function listEmployeeAccounts(accessToken: string): Promise<EmployeeAccount[]> {
  const response = await apiRequest<{ items: EmployeeAccount[] }>("/api/v1/platform/employee-accounts", null, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.items;
}

export async function createEmployeeAccount(accessToken: string, input: {
  name: string; phone: string; email: string; account: string; department: string; position: string; employeeNo?: string;
}): Promise<{ id: string; account: string; temporaryPassword: string }> {
  return apiRequest<{ id: string; account: string; temporaryPassword: string }>("/api/v1/platform/employee-accounts", null, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateEmployeeStatus(accessToken: string, id: string, status: 'active' | 'disabled'): Promise<void> {
  await apiRequest<void>(`/api/v1/platform/employee-accounts/${id}/status`, null, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function resetEmployeePassword(accessToken: string, id: string): Promise<{ temporaryPassword: string }> {
  return apiRequest<{ temporaryPassword: string }>(`/api/v1/platform/employee-accounts/${id}/reset-password`, null, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function completeFirstLogin(input: { account: string; currentPassword: string; newPassword: string }): Promise<void> {
  await apiRequest<void>("/api/v1/session/complete-first-login", null, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendSmsCode(phone: string): Promise<{ message: string; expiresIn: number; devCode?: string }> {
  return apiRequest<{ message: string; expiresIn: number; devCode?: string }>("/api/v1/session/sms/send-code", null, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function loginWithSms(phone: string, code: string): Promise<AuthenticatedUser> {
  const response = await apiRequest<SessionResponse>("/api/v1/session/sms/login", null, {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  return {
    ...response.user,
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    loginAt: new Date().toISOString(),
    loginType: "account",
    permissionSource: "工业 AI 平台签名会话",
  };
}

export type PasswordResetResult = { message: string };

export async function resetPasswordByEmail(email: string, code: string, newPassword: string): Promise<void> {
  await apiRequest<void>("/api/v1/session/password/reset", null, {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword }),
  });
}

export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  return apiRequest<PasswordResetResult>("/api/v1/session/password/forgot", null, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest<void>("/api/v1/session/password/reset", null, {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function registerTenant(input: {
  account: string;
  password: string;
  name: string;
  phone: string;
  email: string;
  tenantName: string;
  industry: string;
}): Promise<{ message: string }> {
  await apiRequest<{ message: string }>("/api/v1/session/register", null, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { message: "注册成功，请使用注册的账号和密码登录" };
}

export function loadAuthenticatedSession(): AuthenticatedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AuthenticatedUser>;
    if (!value.accessToken || !value.account || !value.expiresAt || new Date(value.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return value as AuthenticatedUser;
  } catch {
    return null;
  }
}

export function saveAuthenticatedSession(user: AuthenticatedUser) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.localStorage.removeItem("industrial-ai-session");
}

export function clearAuthenticatedSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem("industrial-ai-session");
}

// ===== 会话安全扩展 =====

/**
 * 使用当前访问令牌刷新会话，取得新的访问令牌。
 * 仅需访问令牌即可完成刷新（租户信息从令牌声明中派生）。
 */
export async function refreshSession(context: { accessToken: string }): Promise<AuthenticatedUser> {
  const response = await apiRequest<SessionResponse>("/api/v1/session/refresh", null, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.accessToken}` },
  });
  return {
    ...response.user,
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    loginAt: new Date().toISOString(),
    loginType: "account",
    permissionSource: "工业 AI 平台签名会话",
  };
}

/**
 * 注销当前会话，服务端将使访问令牌失效。
 * 仅需访问令牌即可完成注销。
 */
export async function logoutSession(context: { accessToken: string }): Promise<void> {
  await apiRequest<void>("/api/v1/session/logout", null, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.accessToken}` },
  });
}

/**
 * 修改当前登录账号的密码，需要携带完整的 API 上下文（租户 + 令牌）。
 */
export async function changePassword(
  context: ApiContext,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<void>("/api/v1/session/change-password", context, {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}
