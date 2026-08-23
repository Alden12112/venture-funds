import { useEffect, useState } from 'react';

type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

export function useAsyncResource<T>(factory: () => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    factory()
      .then((data) => {
        if (active) setState({ status: 'success', data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : '加载失败';
        setState({ status: 'error', data: null, error: message });
      });

    return () => {
      active = false;
    };
  }, deps);

  return state;
}
