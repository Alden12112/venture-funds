import type { LedgerBundle, LedgerEntry } from '@/types';

function delay<T>(value: T, ms = 160): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function timeAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const entries: LedgerEntry[] = [
  {
    id: 'l-1',
    type: 'deposit',
    amount: 50000,
    currency: 'USD',
    status: 'approved',
    time: timeAgo(30),
    note: '沙盒入金',
    refId: 'DEP-20260823-001',
    direction: 'in',
  },
  {
    id: 'l-2',
    type: 'withdraw',
    amount: 12500,
    currency: 'USD',
    status: 'pending',
    time: timeAgo(88),
    note: '模拟提现，等待人工审核',
    refId: 'WDR-20260823-007',
    direction: 'out',
  },
  {
    id: 'l-3',
    type: 'transfer',
    amount: 8000,
    currency: 'USD',
    status: 'settled',
    time: timeAgo(156),
    note: '账户间内部划转',
    refId: 'TRF-20260822-041',
    direction: 'out',
  },
  {
    id: 'l-4',
    type: 'review',
    amount: 0,
    currency: 'USD',
    status: 'pending',
    time: timeAgo(204),
    note: '大额变更待复核',
    refId: 'REV-20260822-118',
    direction: 'out',
  },
  {
    id: 'l-5',
    type: 'deposit',
    amount: 25000,
    currency: 'USD',
    status: 'approved',
    time: timeAgo(311),
    note: '对账批次补录',
    refId: 'DEP-20260822-014',
    direction: 'in',
  },
  {
    id: 'l-6',
    type: 'withdraw',
    amount: 9600,
    currency: 'USD',
    status: 'rejected',
    time: timeAgo(436),
    note: '风控拒绝，标记异常模式',
    refId: 'WDR-20260821-019',
    direction: 'out',
  },
];

export async function loadLedgerBundle(): Promise<LedgerBundle> {
  return delay({
    entries,
    source: {
      provider: 'AD88 sandbox ledger',
      mode: 'mock',
      updatedAt: entries[0].time,
      cacheState: 'fresh',
    },
  });
}
