import type { AdminBundle, BlacklistEntry, PaperPosition, RegisteredUser, TradeAuditEvent, UserProfile } from '@/types';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadRemoteAdminCredits } from '@/lib/credits';
import { apiFetch } from '@/lib/api';

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function isCurrentMonth(value: string, anchor = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
}

export async function loadAdminBundle(): Promise<AdminBundle> {
  const [remoteUsers, remoteState, tradeEvents, ledger, remoteCredits, blacklist, notifications] = await Promise.all([
    apiFetch<UserProfile[]>('/api/admin/users'),
    apiFetch<{ paperPositions?: PaperPosition[] }>('/api/sync?scope=all').catch((): { paperPositions?: PaperPosition[] } => ({})),
    apiFetch<TradeAuditEvent[]>('/api/admin/trades'),
    loadLedgerBundle('all'),
    loadRemoteAdminCredits(),
    apiFetch<BlacklistEntry[]>('/api/admin/blacklist'),
    apiFetch<AdminBundle['notifications']>('/api/admin/notifications'),
  ]);
  const registrations: RegisteredUser[] = remoteUsers.map((item) => ({
    id: item.id,
    fullName: item.name,
    gmail: item.email,
    phone: item.phone,
    country: item.country ?? 'Other',
    status: item.status === 'active' ? 'approved' : item.status === 'locked' ? 'rejected' : 'pending',
    submittedAt: item.joinedAt,
    tradingScore: item.tradingScore ?? 60,
  }));
  const paperPositions = remoteState.paperPositions ?? [];
  const now = new Date();
  const allUsers = remoteUsers;
  const creditAccounts = remoteCredits.accounts;
  const creditRequests = remoteCredits.requests;
  const monthRegistrations = registrations.filter((item) => isCurrentMonth(item.submittedAt, now));
  const monthLedgerEntries = ledger.entries.filter((item) => isCurrentMonth(item.time, now));
  const monthPositions = tradeEvents.length
    ? tradeEvents.filter((item) => item.action === 'open' && isCurrentMonth(item.createdAt, now))
    : paperPositions.filter((item) => isCurrentMonth(item.openedAt, now));
  const unreadNotifications = notifications.filter((item) => isCurrentMonth(item.createdAt, now) && !item.read);
  const monthlyApproved = monthRegistrations.filter((item) => item.status === 'approved').length;
  const monthlyInflow = monthLedgerEntries.filter((item) => item.direction === 'in').reduce((sum, item) => sum + item.amount, 0);
  const monthlyOutflow = monthLedgerEntries.filter((item) => item.direction === 'out').reduce((sum, item) => sum + item.amount, 0);
  const tradingScores = allUsers.map((item) => item.tradingScore ?? 0);
  const averageTradingScore = tradingScores.length ? Math.round(tradingScores.reduce((sum, item) => sum + item, 0) / tradingScores.length) : 0;

  return delay({
    users: allUsers,
    registrations,
    paperPositions,
    tradeEvents,
    creditAccounts,
    creditRequests,
    ledgerEntries: ledger.entries,
    notifications,
    blacklist,
    report: {
      monthLabel: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(now),
      totalAccounts: allUsers.length,
      monthlyRegistrations: monthRegistrations.length,
      monthlyApproved,
      monthlyLedgerEntries: monthLedgerEntries.length,
      monthlyInflow,
      monthlyOutflow,
      monthlyPositions: monthPositions.length,
      unreadNotifications: unreadNotifications.length,
      averageTradingScore,
    },
    approvals: registrations.map((item) => ({
      id: item.id,
      subject: `注册账号 · ${item.fullName}`,
      owner: item.gmail,
      status: item.status,
      updatedAt: item.submittedAt,
    })),
    configs: [],
    source: {
      provider: 'AD88 shared administration API',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'fresh',
    },
  });
}
