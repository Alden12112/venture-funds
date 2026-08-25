import { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
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
  Languages,
  Landmark,
  MoreHorizontal,
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
  Landmark,
};

const navKeyByPath: Record<string, TranslationKey> = {
  '/app/dashboard': 'nav.dashboard',
  '/app/market': 'nav.market',
  '/app/news': 'nav.news',
  '/app/support': 'nav.support',
  '/app/ledger': 'nav.ledger',
  '/app/funding': 'nav.funding',
  '/app/notifications': 'nav.notifications',
  '/app/settings': 'nav.settings',
};

function navIcon(name: keyof typeof iconMap) {
  return iconMap[name] ?? PanelLeft;
}

const primaryShellLinks = shellLinks.slice(0, 4);
const secondaryShellLinks = shellLinks.slice(4);

export function AppShell() {
  const { session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const online = useOnlineStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location.pathname]);

  const renderNavLink = (link: (typeof shellLinks)[number]) => {
    const Icon = navIcon(link.icon as keyof typeof iconMap);
    return (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip--active' : ''}`}
        onClick={() => setMobileMoreOpen(false)}
      >
        <Icon size={17} aria-hidden="true" />
        <span>{t(navKeyByPath[link.to] ?? 'nav.dashboard')}</span>
      </NavLink>
    );
  };

  const renderMobileNavButton = (link: (typeof shellLinks)[number]) => {
    const Icon = navIcon(link.icon as keyof typeof iconMap);
    const active = location.pathname === link.to;
    return (
      <button
        key={link.to}
        type="button"
        className={`nav-chip ${active ? 'nav-chip--active' : ''}`}
        onClick={() => {
          setMobileMoreOpen(false);
          // Keep all workspace changes inside the authenticated React router.
          // A browser-level navigation can race the session restore while the
          // Trade page owns a long-lived quote stream, leaving the old surface
          // visible even though the visitor selected a different workspace.
          navigate(link.to);
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
      >
        <Icon size={17} aria-hidden="true" />
        <span>{t(navKeyByPath[link.to] ?? 'nav.dashboard')}</span>
      </button>
    );
  };

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <Link to="/app/dashboard" className="brand-lockup">
          <span className="brand-lockup__mark">{brand.name}</span>
          <span className="brand-lockup__name">{brand.english}</span>
        </Link>
        <div className="app-shell__status">
          <span className={`status-pill status-pill--${online ? 'success' : 'warning'}`}>{online ? t('status.online') : t('status.offline')}</span>
          <span className="status-pill status-pill--muted">{t(navKeyByPath[location.pathname] ?? 'nav.dashboard')}</span>
        </div>
        <div className="app-shell__actions">
          <label className="theme-switch">
            <span className="sr-only">{t('ui.theme')}</span>
            <MoonStar size={16} aria-hidden="true" />
            <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)} aria-label={t('ui.theme')}>
              <option value="linen">{t('ui.day')}</option>
              <option value="graphite">{t('ui.graphite')}</option>
              <option value="midnight">{t('ui.midnight')}</option>
            </select>
          </label>
          <label className="locale-picker app-shell__locale">
            <Languages size={15} aria-hidden="true" />
            <span className="sr-only">{t('app.language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t('app.language')}>
              <option value="en">EN</option>
              <option value="zh">中文</option>
              <option value="ms">BM</option>
            </select>
          </label>
          <div className="session-chip">
            <span className="session-chip__name">{session?.name ?? t('ui.guestWorkspace')}</span>
            <span className="session-chip__role">{session?.role === 'admin' ? t('ui.administrator') : t('ui.client')}</span>
          </div>
          <button type="button" className="icon-button" onClick={signOut} aria-label={t('ui.signOut')}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="app-shell__body">
        <aside className="app-shell__sidebar">
          <div className="sidebar-kicker">{t('ui.workspace')}</div>
          <nav className="app-shell__nav app-shell__nav--desktop" aria-label={t('ui.workspace')}>
            {shellLinks.map((link) => renderNavLink(link))}
          </nav>
          <div className="mobile-workspace">
            {mobileMoreOpen ? (
              <nav id="mobile-workspace-menu" className="mobile-workspace__menu" aria-label={t('ui.moreNavigation')}>
                {secondaryShellLinks.map((link) => renderMobileNavButton(link))}
              </nav>
            ) : null}
            <nav className="mobile-workspace__bar" aria-label={t('ui.mobileNavigation')}>
              {primaryShellLinks.map((link) => renderMobileNavButton(link))}
              <button
                type="button"
                className={`nav-chip mobile-workspace__more ${secondaryShellLinks.some((link) => location.pathname === link.to) ? 'nav-chip--active' : ''}`}
                aria-expanded={mobileMoreOpen}
                aria-controls="mobile-workspace-menu"
                onClick={() => setMobileMoreOpen((open) => !open)}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
                <span>{t('nav.more')}</span>
              </button>
            </nav>
          </div>
          <div className="sidebar-trust-card">
            <div className="sidebar-trust-card__head">
              <span className="status-dot status-dot--live" />
              <span>{t('ui.systemHealth')}</span>
            </div>
            <strong>{online ? t('ui.allSystemsOperational') : t('ui.connectionDegraded')}</strong>
            <span>{t('ui.paperExecutionActive')}</span>
          </div>
        </aside>

        <div className="app-shell__main">
          <div className="market-statusbar" aria-label={t('ui.workspace')}>
            <span><Activity size={14} /> {t('ui.marketDataMonitored')}</span>
            <span><ShieldCheck size={14} /> {t('ui.paperExecutionOnly')}</span>
            <span><Clock3 size={14} /> {t('ui.asiaSession')}</span>
            <span className="market-statusbar__spacer" />
            <span className="market-statusbar__secure"><span className="status-dot status-dot--live" /> {t('ui.encryptedWorkspace')}</span>
          </div>
          <main className="app-shell__content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
