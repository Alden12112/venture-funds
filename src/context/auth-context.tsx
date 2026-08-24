import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { SessionRole, UserProfile } from '@/types';
import { readStorage, removeStorage, writeStorage } from '@/lib/storage';
import { ApiError, apiFetch, getAuthToken, setAuthToken } from '@/lib/api';

interface SessionState {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: SessionRole;
  tradingScore: number;
}

interface AuthContextValue {
  session: SessionState | null;
  profile: UserProfile | null;
  ready: boolean;
  signIn: (input: { id?: string; name: string; email: string; phone?: string; country?: string; role?: SessionRole; tradingScore?: number; token?: string }) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<Pick<UserProfile, 'name' | 'email' | 'phone' | 'country' | 'tier'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionState | null>(() => readStorage('session', null));
  const [profile, setProfile] = useState<UserProfile | null>(() => readStorage('profile', null));

  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!session || !token) {
      setReady(true);
      return () => { cancelled = true; };
    }
    // Validate a persisted token before rendering protected pages. A Render
    // redeploy or secret rotation should return the visitor to the appropriate
    // login screen rather than showing a broken admin workspace.
    void apiFetch<UserProfile>('/api/auth/me')
      .then((account) => {
        if (cancelled) return;
        setSession({
          id: account.id,
          name: account.name,
          email: account.email,
          phone: account.phone ?? '',
          role: account.role,
          tradingScore: Number(account.tradingScore ?? (account.role === 'admin' ? 100 : 0)),
        });
        setProfile(account);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          setSession(null);
          setProfile(null);
          setAuthToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    writeStorage('session', session);
  }, [session]);

  useEffect(() => {
    writeStorage('profile', profile);
  }, [profile]);

  useEffect(() => {
    if (!ready || !session || !getAuthToken()) return;
    let cancelled = false;
    void apiFetch<Record<string, unknown>>('/api/sync').then((remoteState) => {
      if (cancelled) return;
      // Notify mounted pages after restoring the server snapshot. Without the
      // event, a page opened on a second device could keep its initial empty
      // local state until a full reload even though the API had returned the
      // user's positions and preferences successfully.
      Object.entries(remoteState).forEach(([key, value]) => writeStorage(key, value, { sync: false, notify: true }));
      const remoteProfile = readStorage<UserProfile | null>('profile', null);
      if (remoteProfile) setProfile(remoteProfile);
    }).catch(() => undefined);
    void apiFetch<UserProfile>('/api/profile').then((remoteProfile) => {
      if (!cancelled) setProfile(remoteProfile);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [ready, session?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      ready,
      signIn(input) {
        const next: SessionState = {
          // Preserve the server-issued account id. Email was used by an older
          // client build, which made cross-device workspace records look like
          // they belonged to a different identity from credits and audit logs.
          id: input.id ?? input.email.toLowerCase(),
          name: input.name,
          email: input.email,
          phone: input.phone ?? '',
          role: input.role ?? 'user',
          tradingScore: Number(input.tradingScore ?? (input.role === 'admin' ? 100 : 0)),
        };
        setSession(next);
        setProfile((current) => ({
          id: next.id,
          name: next.name,
          email: next.email,
          phone: input.phone ?? current?.phone ?? '',
          country: input.country ?? current?.country ?? 'Malaysia',
          role: next.role,
          status: current?.status ?? 'active',
          joinedAt: current?.joinedAt ?? new Date().toISOString(),
          tier: current?.tier ?? 'Core',
          tradingScore: next.tradingScore,
        }));
        if (input.token) setAuthToken(input.token);
      },
      signOut() {
        setSession(null);
        removeStorage('session');
        setAuthToken(null);
      },
      updateProfile(patch) {
        setProfile((current) => {
          const next: UserProfile = {
            id: current?.id ?? 'demo',
            name: patch.name ?? current?.name ?? 'AD88 User',
            email: patch.email ?? current?.email ?? 'demo@meridian.example',
            phone: patch.phone ?? current?.phone ?? '',
            country: patch.country ?? current?.country ?? 'Malaysia',
            role: current?.role ?? 'user',
            status: current?.status ?? 'active',
            joinedAt: current?.joinedAt ?? new Date().toISOString(),
            tier: patch.tier ?? current?.tier ?? 'Core',
            tradingScore: current?.tradingScore ?? 0,
          };
          return next;
        });
        void apiFetch<UserProfile>('/api/profile', { method: 'PUT', body: JSON.stringify(patch) }).then((remoteProfile) => setProfile(remoteProfile)).catch(() => undefined);
      },
    }),
    [profile, ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

export function useProfile() {
  return readStorage<UserProfile | null>('profile', null);
}
