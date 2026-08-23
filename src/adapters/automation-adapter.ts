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
    name: '行情同步 - BTC/ETH 15 分钟',
    status: 'running',
    schedule: '每 15 分钟',
    lastRun: timeAgo(7),
    nextRun: timeAgo(-8),
    successRate: 99.4,
    autoSync: true,
    autoNotify: true,
    logs: ['07:31 同步成功', '07:16 同步成功', '07:01 同步成功'],
  },
  {
    id: 't-2',
    name: '新闻聚合 - RSS 批处理',
    status: 'scheduled',
    schedule: '每 30 分钟',
    lastRun: timeAgo(23),
    nextRun: timeAgo(-7),
    successRate: 96.8,
    autoSync: true,
    autoNotify: false,
    logs: ['07:15 聚合 8 条新闻', '06:45 聚合 6 条新闻'],
  },
  {
    id: 't-3',
    name: '资金流水核对',
    status: 'paused',
    schedule: '每日 09:00',
    lastRun: timeAgo(136),
    nextRun: timeAgo(-200),
    successRate: 98.1,
    autoSync: false,
    autoNotify: true,
    logs: ['昨日对账完成', '异常引用已标注'],
  },
  {
    id: 't-4',
    name: '通知触发器',
    status: 'running',
    schedule: '事件驱动',
    lastRun: timeAgo(4),
    nextRun: timeAgo(-1),
    successRate: 99.9,
    autoSync: true,
    autoNotify: true,
    logs: ['未读计数更新', '高优先级通知推送完成'],
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
