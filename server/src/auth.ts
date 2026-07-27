import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionClaims = {
  sub: string;
  name: string;
  role: string;
  tenantIds: string[];
  permissions: string[];
  permissionVersion: string;
  iat: number;
  exp: number;
  iss: "industrial-ai-platform";
};

export type SessionUser = {
  account: string;
  name: string;
  role: string;
  tenantIds: string[];
  permissions: string[];
  permissionVersion: string;
};

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const decodeJson = <T>(value: string): T => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;

const signature = (value: string, secret: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

export function issueAccessToken(user: SessionUser, secret: string, ttlSeconds = 8 * 60 * 60) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: user.account,
    name: user.name,
    role: user.role,
    tenantIds: user.tenantIds,
    permissions: user.permissions,
    permissionVersion: user.permissionVersion,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    iss: "industrial-ai-platform",
  };
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const unsigned = `${header}.${payload}`;
  return { accessToken: `${unsigned}.${signature(unsigned, secret)}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function verifyAccessToken(token: string, secret: string): SessionClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("INVALID_TOKEN");
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(unsigned, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("INVALID_TOKEN");
  const claims = decodeJson<SessionClaims>(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== "industrial-ai-platform" || !claims.sub || !Array.isArray(claims.tenantIds) || claims.exp <= now) {
    throw new Error("INVALID_TOKEN");
  }
  return claims;
}

const developmentNames: Record<string, string> = {
  admin: "系统管理员",
  reviewer: "生产复核员",
  operator: "车间操作员",
  inspector: "质量检验员",
};

export const developmentSessionUser = (account: string): SessionUser => ({
  account,
  name: developmentNames[account] ?? account,
  role: "超级管理员",
  tenantIds: ["TENANT-SHWS", "TENANT-HDJG"],
  permissions: ["*"],
  permissionVersion: "development-session-v1",
});
