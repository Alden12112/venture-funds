import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Bell,
  Clock3,
  LogOut,
  MoonStar,
  PanelLeft,
  ShieldCheck,
  SunMedium,
  MonitorSmartphone,
  BadgeCheck,
  Headphones,
} from 'lucide-react';
import { brand, shellLinks } from '@/data/brand';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/context/theme-context';
import { useLanguage } from '@/context/language-context';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import type { TranslationKey } from '@/i18n/translations';

const iconMap = {
  LayoutDashboard: PanelLeft,
  BarChart3: MonitorSmartphone,
  Newspaper: Bell,
  Headphones,
  Sparkles: BadgeCheck,
  FileClock: PanelLeft,
  BellRing: Bell,
  Settings2: SunMedium,
  ShieldCheck: BadgeCheck,
};

const navKeyByPath: Record<string, TranslationKey> = {
  '/app/dashboard': 'nav.dashboard',
  '/app/market': 'nav.market',
  '/app/news': 'nav.news',
  '/app/support': 'nav.support',
  '/app/ledger': 'nav.ledger',
  '/app/notifications': 'nav.notifications',
  '/app/settings': 'nav.settings',
};

function navIcon(name: keyof typeof iconMap) {
  return iconMap[name] ?? PanelLeft;
}

export function AppShell() {
  const { session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const online = useOnlineStatus();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <Link to="/app/dashboard" className="brand-lockup">
          <span className="brand-lockup__mark">{brand.name}</span>
          <span className="brand-lockup__name">{brand.english}</span>
        </Link>
        <div className="app-shell__status">
          <span className={`status-pill status-pill--${online ? 'success' : 'warning'}`}>{online ? t('status.online') : t('status.offline')}</span>
          <span className="status-pill status-pill--muted">{location.pathname.replace('/app/', '') || 'dashboard'}</span>
        </div>
        <div className="app-shell__actions">
          <label className="theme-switch">
            <span className="sr-only">Theme</span>
            <MoonStar size={16} aria-hidden="true" />
            <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)} aria-label="Theme">
              <option value="linen">Day</option>
              <option value="graphite">Graphite</option>
              <option value="midnight">Midnight</option>
            </select>
          </label>
          <div className="session-chip">
            <span className="session-chip__name">{session?.name ?? 'Guest workspace'}</span>
            <span className="session-chip__role">{session?.role === 'admin' ? 'Administrator' : 'Client'}</span>
          </div>
          <button type="button" className="icon-button" onClick={signOut} aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="app-shell__body">
        <aside className="app-shell__sidebar">
          <div className="sidebar-kicker">Workspace</div>
          <nav className="app-shell__nav" aria-label="Primary navigation">
            {shellLinks.map((link) => {
              const Icon = navIcon(link.icon as keyof typeof iconMap);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip--active' : ''}`}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{t(navKeyByPath[link.to] ?? 'nav.dashboard')}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="sidebar-trust-card">
            <div className="sidebar-trust-card__head">
              <span className="status-dot status-dot--live" />
              <span>System health</span>
            </div>
            <strong>{online ? 'All systems operational' : 'Connection degraded'}</strong>
            <span>Paper execution and risk checks are active.</span>
          </div>
        </aside>

        <div className="app-shell__main">
          <div className="market-statusbar" aria-label="Platform assurance">
            <span><Activity size={14} /> Market data monitored</span>
            <span><ShieldCheck size={14} /> Paper execution only</span>
            <span><Clock3 size={14} /> Asia/Kuala Lumpur session</span>
            <span className="market-statusbar__spacer" />
            <span className="market-statusbar__secure"><span className="status-dot status-dot--live" /> Encrypted workspace</span>
          </div>
          <main className="app-shell__content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
