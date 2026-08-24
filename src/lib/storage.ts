const prefix = 'meridian.';

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T, options: { sync?: boolean; notify?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(prefix + key, JSON.stringify(value));
  if (options.notify !== false) window.dispatchEvent(new CustomEvent('ad88:storage-sync', { detail: { key } }));
  if (options.sync === false || key === 'session' || key === 'profile' || key === 'auth-token') return;
  const token = window.localStorage.getItem(prefix + 'auth-token');
  if (!token) return;
  void fetch('/api/sync', {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key, value }),
  }).catch(() => undefined);
}

export function removeStorage(key: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(prefix + key);
  window.dispatchEvent(new CustomEvent('ad88:storage-sync', { detail: { key } }));
}
