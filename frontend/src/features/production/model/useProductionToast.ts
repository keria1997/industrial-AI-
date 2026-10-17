import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Toast = { show: boolean; msg: string; type: string };
const hidden: Toast = { show: false, msg: '', type: 'success' };

/** Each message owns its full lifetime; late callers from a previous scope are ignored. */
export function useProductionToast(scope: string) {
  const identity = useMemo(() => ({}), [scope]);
  const current = useRef(identity);
  current.current = identity;
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [state, setState] = useState({ identity, toast: hidden });
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimer(); };
  }, [identity, clearTimer]);
  const closeToast = useCallback(() => {
    if (current.current !== identity || !mounted.current) return;
    clearTimer();
    setState({ identity, toast: hidden });
  }, [identity, clearTimer]);
  const showToast = useCallback((msg: string, type = 'success') => {
    if (current.current !== identity || !mounted.current) return;
    clearTimer();
    setState({ identity, toast: { show: true, msg, type } });
    timer.current = setTimeout(closeToast, 5000);
  }, [identity, clearTimer, closeToast]);
  return { toast: state.identity === identity ? state.toast : hidden, showToast, closeToast };
}
