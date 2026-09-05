import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api';
import { readStorage, writeStorage } from '@/lib/storage';
import type { SupportMessage } from '@/types';

export type SupportReadScope = 'user' | 'admin';
type SupportReadCursors = Record<string, string>;

const readEvent = 'venture:support-read';

function storageKey(scope: SupportReadScope, identity: string) {
  return `supportReadCursors.${scope}.${identity}`;
}

function normalizeCursors(value: unknown): SupportReadCursors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([threadId, timestamp]) => typeof threadId === 'string' && typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))),
  );
}

function timestampIsAfter(candidate: string, baseline: string | undefined) {
  const candidateTime = Date.parse(candidate);
  const baselineTime = baseline ? Date.parse(baseline) : Number.NEGATIVE_INFINITY;
  return Number.isFinite(candidateTime) && candidateTime > baselineTime;
}

function mergeCursors(...sources: SupportReadCursors[]) {
  return sources.reduce<SupportReadCursors>((merged, source) => {
    Object.entries(source).forEach(([threadId, timestamp]) => {
      if (timestampIsAfter(timestamp, merged[threadId])) merged[threadId] = timestamp;
    });
    return merged;
  }, {});
}

function incomingRole(scope: SupportReadScope) {
  return scope === 'admin' ? 'user' : 'admin';
}

function cursorState(scope: SupportReadScope, identity: string) {
  return readStorage<SupportReadCursors>(storageKey(scope, identity), {});
}

export function countUnreadSupportMessages(messages: SupportMessage[], scope: SupportReadScope, identity: string, threadId?: string) {
  const cursors = cursorState(scope, identity);
  const senderRole = incomingRole(scope);
  return messages.filter((message) => message.senderRole === senderRole && (!threadId || message.threadId === threadId) && timestampIsAfter(message.createdAt, cursors[message.threadId])).length;
}

export function markSupportMessagesRead(messages: SupportMessage[], scope: SupportReadScope, identity: string, threadId?: string) {
  if (!identity) return false;
  const current = cursorState(scope, identity);
  const senderRole = incomingRole(scope);
  const next = { ...current };
  let changed = false;

  messages.forEach((message) => {
    if (message.senderRole !== senderRole || (threadId && message.threadId !== threadId)) return;
    if (timestampIsAfter(message.createdAt, next[message.threadId])) {
      next[message.threadId] = message.createdAt;
      changed = true;
    }
  });

  if (!changed) return false;
  writeStorage(storageKey(scope, identity), next);
  window.dispatchEvent(new CustomEvent(readEvent));
  return true;
}

export function useSupportUnread(adminMode = false) {
  const { session } = useAuth();
  const scope: SupportReadScope = adminMode ? 'admin' : 'user';
  const identity = session?.id ?? '';
  const [unreadCount, setUnreadCount] = useState(0);

  const hydrateCursors = useCallback(async () => {
    if (!identity) return;
    const key = storageKey(scope, identity);
    const local = cursorState(scope, identity);
    try {
      const remoteState = await apiFetch<Record<string, unknown>>('/api/sync', { cache: 'no-store' });
      const merged = mergeCursors(local, normalizeCursors(remoteState[key]));
      if (JSON.stringify(merged) !== JSON.stringify(local)) writeStorage(key, merged, { sync: false });
    } catch {
      // Local cursors remain usable while the shared state is reconnecting.
    }
  }, [identity, scope]);

  const refresh = useCallback(async () => {
    if (!identity) {
      setUnreadCount(0);
      return;
    }
    try {
      const messages = await apiFetch<SupportMessage[]>('/api/support/messages', { cache: 'no-store' });
      setUnreadCount(countUnreadSupportMessages(messages, scope, identity));
    } catch {
      // Keep the last known indicator while a request is retried.
    }
  }, [identity, scope]);

  useEffect(() => {
    void hydrateCursors();
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    const stateTimer = window.setInterval(() => void hydrateCursors(), 10_000);
    const refreshAfterRead = () => void refresh();
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void hydrateCursors();
        void refresh();
      }
    };
    window.addEventListener(readEvent, refreshAfterRead);
    window.addEventListener('ad88:storage-sync', refreshAfterRead);
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(stateTimer);
      window.removeEventListener(readEvent, refreshAfterRead);
      window.removeEventListener('ad88:storage-sync', refreshAfterRead);
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [hydrateCursors, refresh]);

  return { hasUnread: unreadCount > 0, unreadCount, refresh };
}
