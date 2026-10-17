/** Current AuthController mails a six-digit code in the token query parameter. */
export function readPasswordResetRoute(location: Pick<Location, 'pathname' | 'search'>) {
  if (location.pathname.replace(/\/$/, '') !== '/reset-password') return null;
  const values = new URLSearchParams(location.search).getAll('token');
  const code = values.length === 1 && /^\d{6}$/.test(values[0]) ? values[0] : '';
  return { code };
}

/** Remove reset credentials on completion/abandonment; never persist them in business storage. */
export function leavePasswordResetRoute() {
  if (window.location.pathname.replace(/\/$/, '') === '/reset-password') {
    window.history.replaceState({}, '', '/');
  }
}
