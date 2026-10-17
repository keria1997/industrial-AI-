type PositionSession = {
  displayPosition?: unknown;
  tenantIds?: readonly string[];
};

export function resolveDisplayPosition(
  user: PositionSession | null | undefined,
  tenantId: string,
): string {
  // A scalar position is unambiguous only for a session authorizing this single tenant.
  // Multi-tenant sessions need a tenant-scoped backend contract before displaying a position.
  const tenantIds = [...new Set(user?.tenantIds ?? [])];
  if (!tenantId || tenantIds.length !== 1 || tenantIds[0] !== tenantId) return '岗位信息未提供';
  const position = user?.displayPosition;
  return typeof position === 'string' && position.trim() ? position.trim() : '岗位信息未提供';
}
