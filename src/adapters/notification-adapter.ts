import type { NotificationBundle, NotificationItem } from '@/types';
import { readStorage } from '@/lib/storage';

function delay<T>(value: T, ms = 140): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function timeAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const items: NotificationItem[] = [
  {
    id: 'm-1',
    category: 'system',
    title: '系统完成版本切换',
    body: '当前会话已载入新的信息层，界面状态保持一致。',
    read: false,
    createdAt: timeAgo(18),
    level: 'success',
    targetPath: '/app/settings',
  },
  {
    id: 'm-2',
    category: 'market',
    title: 'BTC 波动带宽扩大',
    body: '过去 30 分钟内价格区间收宽，关注深度和成交量配合。',
    read: false,
    createdAt: timeAgo(36),
    level: 'warning',
    targetPath: '/app/market',
  },
  {
    id: 'm-3',
    category: 'task',
    title: '资金同步任务已完成',
    body: '账本镜像更新正常，没有发现异常引用。',
    read: true,
    createdAt: timeAgo(67),
    level: 'info',
    targetPath: '/app/ledger',
  },
  {
    id: 'm-4',
    category: 'fund',
    title: '提现审核进入人工复核',
    body: '模拟记录已标记为待审核，等待后台确认。',
    read: true,
    createdAt: timeAgo(104),
    level: 'critical',
    targetPath: '/app/ledger',
  },
  {
    id: 'm-5',
    category: 'system',
    title: '通知中心缓存刷新',
    body: '已同步最新未读计数和分类筛选状态。',
    read: true,
    createdAt: timeAgo(132),
    level: 'info',
    targetPath: '/app/notifications',
  },
  {
    id: 'm-6',
    category: 'market',
    title: 'ETH 深度恢复到近七日中位水平',
    body: '买卖盘结构较前一时段更均衡。',
    read: false,
    createdAt: timeAgo(167),
    level: 'success',
    targetPath: '/app/market',
  },
];

export async function loadNotificationBundle(): Promise<NotificationBundle> {
  const readState = readStorage<Record<string, boolean>>('notificationReads', {});
  return delay({
    items: items.map((item) => ({ ...item, read: readState[item.id] ?? item.read })),
    source: {
      provider: 'AD88 notification bus adapter',
      mode: 'mock',
      updatedAt: items[0].createdAt,
      cacheState: 'fresh',
    },
  });
}
