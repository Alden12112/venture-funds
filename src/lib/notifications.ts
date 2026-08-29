import type { NotificationItem } from '@/types';

/**
 * The notification center is intentionally focused on operational work:
 * funding, task and system events. Market movement remains available in the
 * market workspace and is not repeated as an alert in every surface.
 *
 * This is a display policy, not a destructive delete. The server can retain
 * the complete audit stream while the customer-facing center stays calm and
 * actionable.
 */
export const notificationCenterCategories = ['fund', 'task', 'system'] as const;

export type NotificationCenterCategory = (typeof notificationCenterCategories)[number];
export type NotificationCenterItem = Omit<NotificationItem, 'category'> & { category: NotificationCenterCategory };

export function isNotificationCenterCategory(value: string | undefined): value is NotificationCenterCategory {
  if (!value) return false;
  return (notificationCenterCategories as readonly string[]).includes(value);
}

export function isNotificationCenterItem(item: NotificationItem): item is NotificationCenterItem {
  return isNotificationCenterCategory(item.category);
}
