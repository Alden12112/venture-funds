import type { ShellLink } from '@/types';
import { BarChart3, BellRing, BriefcaseBusiness, FileClock, Headphones, Landmark, LayoutDashboard, Newspaper, Settings2 } from 'lucide-react';

export const brand = {
  name: 'AD88',
  english: 'AD88 Markets',
  claim: 'A clear market operating system for research, execution safeguards, risk controls and account oversight.',
  preview: 'Institutional market operating system',
};

export const shellLinks: ShellLink[] = [
  { to: '/app/dashboard', label: 'Command Center', icon: 'LayoutDashboard' },
  { to: '/app/market', label: 'Trade', icon: 'BarChart3' },
  { to: '/app/news', label: 'Research', icon: 'Newspaper' },
  { to: '/app/support', label: 'Client Support', icon: 'Headphones' },
  { to: '/app/ledger', label: 'Activity', icon: 'FileClock' },
  { to: '/app/funding', label: 'Funding', icon: 'Landmark' },
  { to: '/app/notifications', label: 'Alerts', icon: 'BellRing' },
  { to: '/app/settings', label: 'Settings', icon: 'Settings2' },
];

export const brandMarkers = [
  {
    title: 'landing.markerIntelligence',
    text: 'landing.markerIntelligenceText',
    icon: Landmark,
  },
  {
    title: 'landing.markerIntegrity',
    text: 'landing.markerIntegrityText',
    icon: BriefcaseBusiness,
  },
];
