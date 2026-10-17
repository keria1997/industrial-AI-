export function resolveAccountRole(user: { role?: unknown } | null | undefined): string {
  // Display only the backend account role; presentation groups never supply a missing role.
  return typeof user?.role === 'string' && user.role.trim() ? user.role.trim() : '角色信息未提供';
}
