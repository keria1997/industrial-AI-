// PRD authentication and security sections share one minimum creation/reset rule.
export function validateNewPassword(password: string): string | null {
  if (password.length < 10) return '密码至少 10 位，须包含大写字母、小写字母和数字';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return '密码必须同时包含大写字母、小写字母和数字';
  return null;
}
