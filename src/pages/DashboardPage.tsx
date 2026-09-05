import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BriefcaseBusiness, Newspaper, Radar, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { Sparkline } from '@/components/Charts';
import { MarketTicker } from '@/components/MarketTicker';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatCurrency, formatDateTime, formatMarketCurrency, formatPercent } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { loadRemoteCreditAccount } from '@/lib/credits';
import type { CreditAccount } from '@/types';
import { assetNameKey } from '@/data/assets';
import { labelCalendarTitle, labelCountry, labelMarket, labelNewsCategory, labelNewsImpact, labelNewsSummary } from '@/lib/news-labels';
import { VentureCampaignRail } from '@/components/VentureCampaignRail';

const dashboardStatusKeys: Record<string, string> = {
  approved: 'status.approved', settled: 'status.settled', pending: 'status.pending', rejected: 'status.rejected',
};

export function DashboardPage() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const market = useAsyncResource(() => loadMarketBundle('BTC'), []);
  const ledger = useAsyncResource(() => loadLedgerBundle(), []);
  const research = useAsyncResource(() => loadNewsBundle(), []);
  const notifications = useAsyncResource(() => loadNotificationBundle(), []);
  const [creditVersion, setCreditVersion] = useState(0);
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void loadRemoteCreditAccount(session).then((account) => {
      if (cancelled) return;
      setCreditAccount(account);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [creditVersion, session]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key === 'creditAccounts') setCreditVersion((value) => value + 1);
    };
    window.addEventListener('ad88:storage-sync', refresh);
    return () => window.removeEventListener('ad88:storage-sync', refresh);
  }, []);

  if ([market, ledger, notifications].some((resource) => resource.status === 'loading')) {
    return <LoadingState label={t('dashboard.loading')} />;
  }

  if (market.status === 'error' || ledger.status === 'error' || notifications.status === 'error') {
    return <div className="state-block state-block--error"><strong>{t('dashboard.unavailable')}</strong><p>{t('dashboard.unavailableHint')}</p></div>;
  }

  if (market.status !== 'success' || ledger.status !== 'success' || notifications.status !== 'success') {
    return <LoadingState label={t('dashboard.loading')} />;
  }

  const totalAssets = creditAccount?.balance ?? 0;
  const availableMargin = creditAccount?.available ?? 0;
  const pendingMargin = creditAccount?.pending ?? 0;
  const pendingLedger = ledger.data.entries.filter((entry) => entry.status === 'pending').length;
  const unread = notifications.data.items.filter((item) => !item.read).length;
  const trendSeries = market.data.candles.slice(-24).map((item) => item.close);
  const topMoves = [...market.data.assets].sort((left, right) => Math.abs(right.change24h) - Math.abs(left.change24h)).slice(0, 3);
  const researchItems = research.status === 'success' ? research.data.items.slice(0, 3) : [];
  const nextEvent = research.status === 'success' ? research.data.events[0] : null;
  const labelStatus = (value: string) => dashboardStatusKeys[value] ? t(dashboardStatusKeys[value]) : value;

  return (
    <div className="page-stack command-center">
      <PageHeader eyebrow={t('dashboard.eyebrow')} title={t('dashboard.title')} description={t('dashboard.description')} actions={<Link to="/app/market" className="btn btn--primary"><BriefcaseBusiness size={16} /> {t('dashboard.openTrade')}</Link>} />

      <MarketTicker assets={market.data.assets} />

      <section className="metric-grid metric-grid--command">
         <StatCard label={t('dashboard.accountValue')} value={formatCurrency(totalAssets)} note={totalAssets ? t('dashboard.paperBalance') : t('dashboard.noFundedBalance')} />
         <StatCard label={t('dashboard.buyingPower')} value={formatCurrency(availableMargin)} />
         <StatCard label={t('dashboard.reviewQueue')} value={String(pendingLedger)} note={t('dashboard.reviewQueueHint')} />
         <StatCard label={t('dashboard.attentionRequired')} value={String(unread)} note={unread ? t('dashboard.unreadAlerts') : t('dashboard.noUnreadAlerts')} />
      </section>

      <section className="command-center__hero">
        <div className="command-center__hero-copy">
           <span className="eyebrow">{t('dashboard.heroEyebrow')}</span>
           <h2>{t('dashboard.heroTitle')}</h2>
           <p>{t('dashboard.heroText')}</p>
           <div className="command-center__hero-actions"><Link to="/app/news" className="btn btn--ghost"><Newspaper size={16} /> {t('dashboard.research')}</Link><Link to="/app/support" className="link-action">{t('dashboard.support')} <ArrowRight size={16} /></Link></div>
        </div>
        <div className="command-center__hero-market">
           <div className="command-center__hero-market-head"><div><span>{t('dashboard.featuredReference')}</span><strong>{market.data.selected.symbol} · {t(assetNameKey(market.data.selected.symbol))}</strong></div><StatusPill tone={market.data.selected.change24h >= 0 ? 'success' : 'critical'}>{formatPercent(market.data.selected.change24h)}</StatusPill></div>
          <strong className="command-center__hero-price">{formatMarketCurrency(market.data.selected.price)}</strong>
          <Sparkline values={trendSeries} positive={market.data.selected.change24h >= 0} />
          <DataMeta source={market.data.source} />
        </div>
      </section>

       <section className="platform-assurance-rail" aria-label={t('dashboard.description')}>
         <div><ShieldCheck size={18} /><span><strong>{t('dashboard.riskFirst')}</strong><small>{t('dashboard.riskFirstText')}</small></span></div>
         <div><Radar size={18} /><span><strong>{t('dashboard.dataIntegrity')}</strong><small>{t('dashboard.dataIntegrityText')}</small></span></div>
         <div><AlertTriangle size={18} /><span><strong>{t('dashboard.paperEnvironment')}</strong><small>{t('dashboard.paperEnvironmentText')}</small></span></div>
       </section>

      <VentureCampaignRail />

      <section className="content-grid content-grid--two command-center__primary-grid">
        <article className="panel credit-console">
           <div className="panel__head"><div><h2><WalletCards size={18} /> {t('dashboard.accountControls')}</h2><p>{t('dashboard.accountControlsHint')}</p></div><StatusPill tone={pendingMargin ? 'warning' : 'info'}>{pendingMargin ? `${pendingMargin} U${t('dashboard.pendingReview')}` : t('dashboard.noPendingReview')}</StatusPill></div>
           <div className="credit-balance-grid"><StatCard label={t('dashboard.balance')} value={`${totalAssets.toFixed(2)} U`} note={t('dashboard.paperBalance')} /><StatCard label={t('dashboard.available')} value={`${availableMargin.toFixed(2)} U`} note={t('market.availableMargin')} /><StatCard label={t('dashboard.inReview')} value={`${pendingMargin.toFixed(2)} U`} note={t('dashboard.notTradableYet')} /></div>
        </article>

        <article className="panel market-intelligence-panel">
           <div className="panel__head"><div><h2><TrendingUp size={18} /> {t('dashboard.marketIntelligence')}</h2><p>{t('dashboard.marketIntelligenceHint')}</p></div><Link to="/app/market" className="link-action">{t('dashboard.exploreMarkets')} <ArrowRight size={16} /></Link></div>
          <div className="market-intelligence-list">{topMoves.map((asset) => <Link to={`/app/market?symbol=${asset.symbol}`} className="market-intelligence-item" key={asset.symbol}><span className="market-intelligence-item__symbol">{asset.symbol}</span><span>{t(assetNameKey(asset.symbol))}</span><strong>{formatMarketCurrency(asset.price)}</strong><em className={asset.change24h >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(asset.change24h)}</em></Link>)}</div>
           <div className="market-intelligence-panel__event"><span>{t('dashboard.nextSignal')}</span><strong>{nextEvent ? labelCalendarTitle(nextEvent.title, t) : t('dashboard.calendarSyncing')}</strong><small>{nextEvent ? `${labelMarket(nextEvent.market, t)} · ${labelCountry(nextEvent.country, t)} · ${formatDateTime(nextEvent.scheduledAt)}` : t('dashboard.researchEventsSoon')}</small></div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
           <div className="panel__head"><div><h2>{t('dashboard.researchBriefing')}</h2><p>{t('dashboard.researchBriefingHint')}</p></div><Link to="/app/news" className="link-action">{t('dashboard.fullResearch')} <ArrowRight size={16} /></Link></div>
           {researchItems.length ? <div className="research-briefing-list">{researchItems.map((item) => <Link to={item.targetPath || '/app/news'} key={item.id} className="research-briefing-item"><span className="eyebrow">{labelNewsCategory(item.category, t)} · {labelCountry(item.country, t)}</span><strong>{item.title}</strong><p>{labelNewsSummary(item.source, t)}</p><footer><span>{item.markets.map((market) => labelMarket(market, t)).join(' · ')}</span><StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{labelNewsImpact(item.impact, t)}</StatusPill></footer></Link>)}</div> : <EmptyState title={t('dashboard.researchSyncing')} text={t('dashboard.nextBriefSoon')} />}
        </article>

        <article className="panel">
           <div className="panel__head"><div><h2>{t('dashboard.recentActivity')}</h2><p>{t('dashboard.recentActivityHint')}</p></div><Link to="/app/ledger" className="link-action">{t('dashboard.viewActivity')} <ArrowRight size={16} /></Link></div>
           {ledger.data.entries.length ? <div className="stack-list">{ledger.data.entries.slice(0, 5).map((entry) => <div key={entry.id} className="stack-list__row"><div><strong>{entry.refId}</strong><span>{entry.note}</span></div><div className="stack-list__meta"><StatusPill tone={entry.status === 'approved' ? 'success' : entry.status === 'pending' ? 'warning' : entry.status === 'rejected' ? 'critical' : 'info'}>{labelStatus(entry.status)}</StatusPill><span>{formatDateTime(entry.time)}</span></div></div>)}</div> : <EmptyState title={t('dashboard.noAccountActivity')} text={t('dashboard.fundingActivitySoon')} />}
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel command-center__alerts">
           <div className="panel__head"><div><h2>{t('dashboard.workspaceAlerts')}</h2><p>{t('dashboard.workspaceAlertsHint')}</p></div><Link to="/app/notifications" className="link-action">{t('dashboard.openAlerts')} <ArrowRight size={16} /></Link></div>
           {notifications.data.items.length ? <div className="stack-list">{notifications.data.items.slice(0, 4).map((item) => <div key={item.id} className="stack-list__row"><div><strong>{item.title}</strong><span>{item.body}</span></div><div className="stack-list__meta"><StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? t('ui.read') : t('ui.unread')}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div></div>)}</div> : <EmptyState title={t('dashboard.noAlerts')} text={t('dashboard.notificationsSoon')} />}
        </article>
      </section>

    </div>
  );
}
