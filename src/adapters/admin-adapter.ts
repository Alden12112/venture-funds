import type { AdminBundle, BlacklistEntry, FundingRequest, LedgerBundle, PaperPosition, RegisteredUser, SharedContentSettingsResponse, TimedMarketScenario, TradeAuditEvent, UserProfile } from '@/types';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadRemoteAdminCredits } from '@/lib/credits';
import { apiFetch } from '@/lib/api';
import { loadAdminFundingRequests } from '@/lib/funding';
import { isNotificationCenterItem } from '@/lib/notifications';

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
  // Account access is the one core request: if it fails, the session is either
  // unauthorized or the shared API is unavailable. Every other admin panel is
  // allowed to degrade independently so one transient module cannot blank the
  // whole console.
  const remoteUsers = await apiFetch<UserProfile[]>('/api/admin/users');
  const degraded: string[] = [];
  const safe = async <T>(label: string, request: () => Promise<T>, fallback: T) => {
    try {
      return await request();
    } catch {
      degraded.push(label);
      return fallback;
    }
  };
  const emptyLedger: LedgerBundle = {
    entries: [],
    source: {
      provider: 'VENTURE FUNDS account ledger API',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'offline',
      health: 'offline',
    },
  };
  const emptyMarketStatus: AdminBundle['marketStatus'] = {
    status: 'offline', quoteCount: 0, ageSeconds: null, cacheSeconds: 8,
  };
  const emptyFundingRequests: FundingRequest[] = [];
  const [remoteState, timedScenarios, tradeEvents, ledger, remoteCredits, fundingRequests, blacklist, notifications, marketStatus, contentResponse] = await Promise.all([
    safe('workspace', () => apiFetch<{ paperPositions?: PaperPosition[] }>('/api/sync?scope=all'), {}),
    safe('market observations', () => apiFetch<TimedMarketScenario[]>('/api/admin/market-scenarios'), []),
    safe('trades', () => apiFetch<TradeAuditEvent[]>('/api/admin/trades'), []),
    safe('ledger', () => loadLedgerBundle('all'), emptyLedger),
    safe('credits', () => loadRemoteAdminCredits(), { accounts: [], requests: [] }),
    safe('funding', () => loadAdminFundingRequests(), emptyFundingRequests),
    safe('blacklist', () => apiFetch<BlacklistEntry[]>('/api/admin/blacklist'), []),
    safe('notifications', async () => (await apiFetch<AdminBundle['notifications']>('/api/admin/notifications')).filter(isNotificationCenterItem), []),
    safe('market', () => apiFetch<AdminBundle['marketStatus']>('/api/market/status'), emptyMarketStatus),
    safe('content settings', () => apiFetch<SharedContentSettingsResponse>('/api/admin/content-settings'), {
      settings: [],
      source: {
        provider: 'VENTURE FUNDS shared content API',
        mode: 'api',
        updatedAt: new Date().toISOString(),
        cacheState: 'offline',
        health: 'offline',
      },
    }),
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
    timedScenarios,
    tradeEvents,
    creditAccounts,
    creditRequests,
    fundingRequests,
    ledgerEntries: ledger.entries,
    notifications,
    marketStatus,
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
      subject: `Registered account · ${item.fullName}`,
      owner: item.gmail,
      status: item.status,
      updatedAt: item.submittedAt,
    })),
    contentSettings: contentResponse.settings,
    configs: contentResponse.settings.map((setting) => ({
      key: setting.key,
      value: setting.values.en,
      scope: 'shared server content',
    })),
    source: {
      provider: 'VENTURE FUNDS shared administration API',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'fresh',
      health: degraded.length ? 'degraded' : 'healthy',
      lineage: degraded.length ? `shared API · partial modules unavailable: ${degraded.join(', ')}` : 'shared API → admin workspace',
    },
  });
}
