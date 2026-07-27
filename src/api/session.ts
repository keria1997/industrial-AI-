import { apiRequest, type ApiContext } from "./client";

export type AuthenticatedUser = {
  account: string;
  name: string;
  role: string;
  tenantIds: string[];
  permissions: string[];
  permissionVersion: string;
  accessToken: string;
  expiresAt: string;
  loginAt: string;
  loginType: "account";
  permissionSource: string;
};

type SessionResponse = {
  accessToken: string;
  expiresAt: string;
  tokenType: "Bearer";
  user: Omit<AuthenticatedUser, "accessToken" | "expiresAt" | "loginAt" | "loginType" | "permissionSource">;
};

const SESSION_KEY = "industrial-ai-session:v2";

export async function loginWithPassword(account: string, password: string): Promise<AuthenticatedUser> {
  const response = await apiRequest<SessionResponse>("/api/v1/session/login", null, {
    method: "POST",
    body: JSON.stringify({ account, password }),
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
