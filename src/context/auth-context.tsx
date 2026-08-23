import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { SessionRole, UserProfile } from '@/types';
import { readStorage, removeStorage, writeStorage } from '@/lib/storage';
import { apiFetch, getAuthToken, setAuthToken } from '@/lib/api';

interface SessionState {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
}

interface AuthContextValue {
  session: SessionState | null;
  profile: UserProfile | null;
  ready: boolean;
  signIn: (input: { name: string; email: string; phone?: string; country?: string; role?: SessionRole; token?: string }) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<Pick<UserProfile, 'name' | 'email' | 'phone' | 'country' | 'tier'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionState | null>(() => readStorage('session', null));
  const [profile, setProfile] = useState<UserProfile | null>(() => readStorage('profile', null));

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    writeStorage('session', session);
  }, [session]);

  useEffect(() => {
    writeStorage('profile', profile);
  }, [profile]);

  useEffect(() => {
    if (!session || !getAuthToken()) return;
    let cancelled = false;
    void apiFetch<Record<string, unknown>>('/api/sync').then((remoteState) => {
      if (cancelled) return;
      Object.entries(remoteState).forEach(([key, value]) => writeStorage(key, value, { sync: false }));
      const remoteProfile = readStorage<UserProfile | null>('profile', null);
      if (remoteProfile) setProfile(remoteProfile);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [session?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      ready,
      signIn(input) {
        const next: SessionState = {
          id: input.email.toLowerCase(),
          name: input.name,
          email: input.email,
          role: input.role ?? 'user',
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
          };
          return next;
        });
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
