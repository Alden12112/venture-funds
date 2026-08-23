import { readStorage, writeStorage } from '@/lib/storage';

const tokenKey = 'auth-token';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getAuthToken() {
  return readStorage<string | null>(tokenKey, null);
}

export function setAuthToken(token: string | null) {
  if (token) writeStorage(tokenKey, token, { sync: false });
  else if (typeof window !== 'undefined') window.localStorage.removeItem('meridian.' + tokenKey);
}

export function isApiUnavailable(error: unknown) {
  return error instanceof ApiError && [0, 404, 500, 502, 503].includes(error.status);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const token = getAuthToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('API unavailable', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(String(body.error || 'Request failed'), response.status);
  return body as T;
}
