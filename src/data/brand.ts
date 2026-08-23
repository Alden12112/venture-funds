import type { ShellLink } from '@/types';
import { BarChart3, BellRing, BriefcaseBusiness, FileClock, Landmark, LayoutDashboard, Newspaper, Settings2 } from 'lucide-react';

export const brand = {
  name: 'AD88',
  english: 'AD88 Markets',
  claim: 'Real-time market data, account controls, paper trading and risk checks in one regulated-style workspace.',
  preview: 'Institutional-style market workspace',
};

export const shellLinks: ShellLink[] = [
  { to: '/app/dashboard', label: '仪表盘', icon: 'LayoutDashboard' },
  { to: '/app/market', label: '行情', icon: 'BarChart3' },
  { to: '/app/news', label: '新闻', icon: 'Newspaper' },
  { to: '/app/ledger', label: '资金流水', icon: 'FileClock' },
  { to: '/app/notifications', label: '通知中心', icon: 'BellRing' },
  { to: '/app/settings', label: '设置', icon: 'Settings2' },
];

export const brandMarkers = [
  {
    title: '资产级摘要',
    text: '同屏查看真实价格、风险预算与模拟仓位。',
    icon: Landmark,
  },
  {
    title: '数据适配层',
    text: '行情与新闻接入公开 API，密钥源可替换。',
    icon: BriefcaseBusiness,
  },
];
