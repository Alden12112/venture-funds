import { useEffect, useState } from 'react';

type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null; refreshing: boolean; refreshError: string | null }
  | { status: 'error'; data: null; error: string };

export function useAsyncResource<T>(factory: () => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    // Preserve an established workspace while a later request is in flight.
    // The old behavior replaced the entire page with a loading screen every
    // time an admin background sync or a market selection refreshed. Besides
    // looking like a white flash, it briefly removed all interactive controls.
    setState((current) => current.status === 'success'
      ? { ...current, refreshing: true, refreshError: null }
      : { status: 'loading', data: null, error: null });
    factory()
      .then((data) => {
        if (active) setState({ status: 'success', data, error: null, refreshing: false, refreshError: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to load workspace data';
        setState((current) => {
          // Once a workspace has loaded, a temporary transport problem should
          // never remove the controls beneath the user's pointer. Keep the
          // last verified data visible and surface the problem as a refresh
          // state instead. An authorization failure is intentionally not
          // retained because callers must end the protected session.
          if (current.status === 'success' && message !== 'unauthorized') {
            return { ...current, refreshing: false, refreshError: message };
          }
          return { status: 'error', data: null, error: message };
        });
      });

    return () => {
      active = false;
    };
  }, deps);

  return state;
}
