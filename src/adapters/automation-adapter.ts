import type { AutomationBundle, AutomationTask } from '@/types';

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function timeAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const tasks: AutomationTask[] = [
  {
    id: 't-1',
    name: 'Market synchronization — BTC/ETH 15 minutes',
    status: 'running',
    schedule: 'Every 15 minutes',
    lastRun: timeAgo(7),
    nextRun: timeAgo(-8),
    successRate: 99.4,
    autoSync: true,
    autoNotify: true,
    logs: ['07:31 synchronized', '07:16 synchronized', '07:01 synchronized'],
  },
  {
    id: 't-2',
    name: 'Research aggregation — RSS batch',
    status: 'scheduled',
    schedule: 'Every 30 minutes',
    lastRun: timeAgo(23),
    nextRun: timeAgo(-7),
    successRate: 96.8,
    autoSync: true,
    autoNotify: false,
    logs: ['07:15 aggregated 8 briefs', '06:45 aggregated 6 briefs'],
  },
  {
    id: 't-3',
    name: 'Funding activity reconciliation',
    status: 'paused',
    schedule: 'Daily 09:00',
    lastRun: timeAgo(136),
    nextRun: timeAgo(-200),
    successRate: 98.1,
    autoSync: false,
    autoNotify: true,
    logs: ['Previous-day reconciliation complete', 'Exception references flagged'],
  },
  {
    id: 't-4',
    name: 'Alert trigger',
    status: 'running',
    schedule: 'Event driven',
    lastRun: timeAgo(4),
    nextRun: timeAgo(-1),
    successRate: 99.9,
    autoSync: true,
    autoNotify: true,
    logs: ['Unread count updated', 'High-priority alert delivered'],
  },
];

export async function loadAutomationBundle(): Promise<AutomationBundle> {
  return delay({
    tasks,
    source: {
      provider: 'AD88 workflow scheduler',
      mode: 'mock',
      updatedAt: tasks[0].lastRun,
      cacheState: 'fresh',
    },
  });
}
