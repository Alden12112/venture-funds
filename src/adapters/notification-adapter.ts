import type { NotificationBundle, NotificationItem } from '@/types';
import { readStorage } from '@/lib/storage';
import { apiFetch } from '@/lib/api';

export async function loadNotificationBundle(): Promise<NotificationBundle> {
  const readState = readStorage<Record<string, boolean>>('notificationReads', {});
  const items = await apiFetch<NotificationItem[]>('/api/notifications');
  return {
    items: items.map((item) => ({ ...item, read: readState[item.id] ?? item.read })),
    source: {
      provider: 'AD88 shared notification API',
      mode: 'api',
      updatedAt: items[0]?.createdAt ?? new Date().toISOString(),
      cacheState: 'fresh',
      health: 'healthy',
      lineage: 'account events → AD88 API → notification center',
    },
  };
}
