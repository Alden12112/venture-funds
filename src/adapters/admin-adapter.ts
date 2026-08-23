import type { AdminBundle, PaperPosition, RegisteredUser, TradeAuditEvent, UserProfile } from '@/types';
import { readStorage } from '@/lib/storage';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { hydrateCreditAccounts, readCreditRequests } from '@/lib/credits';
import { apiFetch } from '@/lib/api';

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function timeAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function isCurrentMonth(value: string, anchor = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
}

const users: UserProfile[] = [
  {
    id: 'u-1',
    name: '林知衡',
    email: 'lin.zhiheng@meridian.example',
    phone: '+86 138 1000 2100',
    country: 'Malaysia',
    role: 'admin',
    status: 'active',
    joinedAt: timeAgo(3200),
    tier: 'Enterprise',
    tradingScore: 92,
  },
  {
    id: 'u-2',
    name: '陈语澄',
    email: 'chen.yucheng@meridian.example',
    phone: '+86 138 1000 2101',
    country: 'Malaysia',
    role: 'user',
    status: 'active',
    joinedAt: timeAgo(2120),
    tier: 'Core',
    tradingScore: 76,
  },
  {
    id: 'u-3',
    name: '许怀序',
    email: 'xu.huaixu@meridian.example',
    phone: '+86 138 1000 2102',
    country: 'Singapore',
    role: 'user',
    status: 'pending',
    joinedAt: timeAgo(960),
    tier: 'Trial',
    tradingScore: 58,
  },
  {
    id: 'u-4',
    name: '周衡远',
    email: 'zhou.hengyuan@meridian.example',
    phone: '+86 138 1000 2103',
    country: 'Indonesia',
    role: 'user',
    status: 'locked',
    joinedAt: timeAgo(160),
    tier: 'Core',
    tradingScore: 24,
  },
];

const approvals = [
  {
    id: 'a-1',
    subject: '提现金额超阈值复核',
    owner: '资金组',
    status: 'pending' as const,
    updatedAt: timeAgo(18),
  },
  {
    id: 'a-2',
    subject: '任务规则版本切换',
    owner: '运营组',
    status: 'approved' as const,
    updatedAt: timeAgo(47),
  },
  {
    id: 'a-3',
    subject: '内容源替换审批',
    owner: '内容组',
    status: 'rejected' as const,
    updatedAt: timeAgo(91),
  },
];

const configs = [
  { key: 'market.source', value: 'https://api.exchange.coinbase.com', scope: 'global' },
  { key: 'news.source', value: 'https://api.gdeltproject.org/api/v2/doc/doc', scope: 'global' },
  { key: 'notification.channel', value: 'adapter://ad88/local-bus', scope: 'ops' },
  { key: 'ledger.audit.mode', value: 'sandbox', scope: 'finance' },
];

export async function loadAdminBundle(): Promise<AdminBundle> {
  const localRegistrations = readStorage<RegisteredUser[]>('pendingRegistrations', []);
  const remoteUsers = await apiFetch<UserProfile[]>('/api/admin/users').catch(() => null);
  const remoteRegistrations: RegisteredUser[] = (remoteUsers ?? []).map((item) => ({
    id: item.id,
    fullName: item.name,
    gmail: item.email,
    phone: item.phone,
    country: item.country ?? 'Other',
    status: item.status === 'active' ? 'approved' : item.status === 'locked' ? 'rejected' : 'pending',
    submittedAt: item.joinedAt,
    tradingScore: item.tradingScore ?? 60,
  }));
  const registrations = remoteUsers ? [...localRegistrations, ...remoteRegistrations.filter((remote) => !localRegistrations.some((local) => local.id === remote.id))] : localRegistrations;
  const paperPositions = readStorage<PaperPosition[]>('paperPositions', []);
  const tradeEvents = await apiFetch<TradeAuditEvent[]>('/api/admin/trades').catch(() => []);
  const ledger = await loadLedgerBundle();
  const notifications = await loadNotificationBundle();
  const now = new Date();
  const registeredUsers: UserProfile[] = registrations.map((item) => ({
    id: item.id,
    name: item.fullName,
    email: item.gmail,
    phone: item.phone,
    country: item.country,
    role: 'user',
    status: item.status === 'approved' ? 'active' : item.status === 'pending' ? 'pending' : 'locked',
    joinedAt: item.submittedAt,
    tier: 'Applicant',
    tradingScore: item.tradingScore,
  }));
  const allUsers = [...(remoteUsers ?? registeredUsers), ...users.filter((seed) => !(remoteUsers ?? []).some((remote) => remote.id === seed.id))];
  const creditAccounts = hydrateCreditAccounts(allUsers);
  const creditRequests = readCreditRequests();
  const monthRegistrations = registrations.filter((item) => isCurrentMonth(item.submittedAt, now));
  const monthLedgerEntries = ledger.entries.filter((item) => isCurrentMonth(item.time, now));
  const monthPositions = (tradeEvents.length ? tradeEvents.filter((item) => item.action === 'open') : paperPositions).filter((item) => isCurrentMonth('createdAt' in item ? item.createdAt : item.openedAt, now));
  const unreadNotifications = notifications.items.filter((item) => isCurrentMonth(item.createdAt, now) && !item.read);
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
    notifications: notifications.items,
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
    approvals,
    configs,
    source: {
      provider: 'AD88 admin console data',
      mode: 'mock',
      updatedAt: approvals[0].updatedAt,
      cacheState: 'fresh',
    },
  });
}
