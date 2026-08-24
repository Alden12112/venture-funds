import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BriefcaseBusiness, HandCoins, Newspaper, Radar, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { Sparkline } from '@/components/Charts';
import { MarketTicker } from '@/components/MarketTicker';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatCurrency, formatDateTime, formatPercent } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { createRemoteCreditRequest, loadRemoteCreditAccount, loadRemoteCreditRequests } from '@/lib/credits';
import type { CreditAccount, CreditRequest } from '@/types';

export function DashboardPage() {
  const { session } = useAuth();
  const market = useAsyncResource(() => loadMarketBundle('XAU'), []);
  const ledger = useAsyncResource(() => loadLedgerBundle(), []);
  const research = useAsyncResource(() => loadNewsBundle(), []);
  const notifications = useAsyncResource(() => loadNotificationBundle(), []);
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState('Margin allocation review');
  const [creditVersion, setCreditVersion] = useState(0);
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void Promise.all([loadRemoteCreditAccount(session), loadRemoteCreditRequests(session)]).then(([account, requests]) => {
      if (cancelled) return;
      setCreditAccount(account);
      setCreditRequests(requests);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [creditVersion, session]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key === 'creditAccounts' || key === 'creditRequests') setCreditVersion((value) => value + 1);
    };
    window.addEventListener('ad88:storage-sync', refresh);
    return () => window.removeEventListener('ad88:storage-sync', refresh);
  }, []);

  const submitCreditRequest = async () => {
    if (!session) return;
    const amount = Math.max(1, Math.round(creditAmount));
    await createRemoteCreditRequest(session, amount, creditReason.trim() || 'Margin allocation review');
    setCreditAmount(100);
    setCreditReason('Margin allocation review');
    setCreditVersion((value) => value + 1);
  };

  if ([market, ledger, notifications].some((resource) => resource.status === 'loading')) {
    return <LoadingState label="Calibrating your AD88 command center" />;
  }

  if (market.status === 'error' || ledger.status === 'error' || notifications.status === 'error') {
    return <div className="state-block state-block--error"><strong>Command center is temporarily unavailable</strong><p>One or more protected workspace services did not respond. Your existing records remain unchanged.</p></div>;
  }

  if (market.status !== 'success' || ledger.status !== 'success' || notifications.status !== 'success') {
    return <LoadingState label="Calibrating your AD88 command center" />;
  }

  const totalAssets = creditAccount?.balance ?? 0;
  const availableMargin = creditAccount?.available ?? 0;
  const pendingMargin = creditAccount?.pending ?? 0;
  const pendingLedger = ledger.data.entries.filter((entry) => entry.status === 'pending').length;
  const unread = notifications.data.items.filter((item) => !item.read).length;
  const trendSeries = market.data.candles.slice(-24).map((item) => item.close);
  const recentCreditRequests = creditRequests.slice(0, 3);
  const topMoves = [...market.data.assets].sort((left, right) => Math.abs(right.change24h) - Math.abs(left.change24h)).slice(0, 3);
  const researchItems = research.status === 'success' ? research.data.items.slice(0, 3) : [];
  const nextEvent = research.status === 'success' ? research.data.events[0] : null;

  return (
    <div className="page-stack command-center">
      <PageHeader eyebrow="AD88 CONTROL ROOM" title="Command Center" description="A single operational view for market intelligence, paper risk, account controls and research signals." actions={<Link to="/app/market" className="btn btn--primary"><BriefcaseBusiness size={16} /> Open trading workspace</Link>} />

      <MarketTicker assets={market.data.assets} />

      <section className="command-center__hero">
        <div className="command-center__hero-copy">
          <span className="eyebrow">MARKET OPERATING SYSTEM</span>
          <h2>See the signal, the risk budget and the next decision without changing context.</h2>
          <p>AD88 keeps market data, research, account activity and paper-execution safeguards in one deliberate control surface.</p>
          <div className="command-center__hero-actions"><Link to="/app/news" className="btn btn--ghost"><Newspaper size={16} /> Research & intelligence</Link><Link to="/app/support" className="link-action">Client support <ArrowRight size={16} /></Link></div>
        </div>
        <div className="command-center__hero-market">
          <div className="command-center__hero-market-head"><div><span>Featured reference</span><strong>{market.data.selected.symbol} · {market.data.selected.name}</strong></div><StatusPill tone={market.data.selected.change24h >= 0 ? 'success' : 'critical'}>{formatPercent(market.data.selected.change24h)}</StatusPill></div>
          <strong className="command-center__hero-price">{formatCurrency(market.data.selected.price)}</strong>
          <Sparkline values={trendSeries} positive={market.data.selected.change24h >= 0} />
          <DataMeta source={market.data.source} />
        </div>
      </section>

      <section className="metric-grid metric-grid--command">
        <StatCard label="Account value" value={formatCurrency(totalAssets)} note={totalAssets ? 'Paper U balance' : 'No funded U balance'} />
        <StatCard label="Buying power" value={formatCurrency(availableMargin)} note="Available for paper margin" />
        <StatCard label="Review queue" value={String(pendingLedger + recentCreditRequests.filter((item) => item.status === 'pending').length)} note="Funding and activity reviews" />
        <StatCard label="Attention required" value={String(unread)} note={unread ? 'Unread workspace alerts' : 'No unread alerts'} />
      </section>

      <section className="platform-assurance-rail" aria-label="Platform assurance">
        <div><ShieldCheck size={18} /><span><strong>Risk-first execution</strong><small>Margin checks and paper safeguards are active before every order.</small></span></div>
        <div><Radar size={18} /><span><strong>Data integrity</strong><small>Broker, live API, cached and fallback states are visible in the trading workspace.</small></span></div>
        <div><AlertTriangle size={18} /><span><strong>Paper environment</strong><small>No live order routing or fund movement is available from this platform.</small></span></div>
      </section>

      <section className="content-grid content-grid--two command-center__primary-grid">
        <article className="panel credit-console">
          <div className="panel__head"><div><h2><WalletCards size={18} /> Account controls</h2><p>Request a paper-margin review; approved balances sync across your secure workspace.</p></div><StatusPill tone={pendingMargin ? 'warning' : 'info'}>{pendingMargin ? `${pendingMargin} U pending` : 'No pending review'}</StatusPill></div>
          <div className="credit-balance-grid"><StatCard label="Balance" value={`${totalAssets.toFixed(2)} U`} note="Paper balance" /><StatCard label="Available" value={`${availableMargin.toFixed(2)} U`} note="Margin available" /><StatCard label="In review" value={`${pendingMargin.toFixed(2)} U`} note="Not tradable yet" /></div>
          <div className="form-grid"><label className="field"><span>Requested U</span><input type="number" min="1" step="1" value={creditAmount} onChange={(event) => setCreditAmount(Number(event.target.value))} /></label><label className="field"><span>Review context</span><input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} /></label></div>
          <button type="button" className="btn btn--primary" onClick={() => void submitCreditRequest()}><HandCoins size={16} /> Submit paper-margin review</button>
        </article>

        <article className="panel market-intelligence-panel">
          <div className="panel__head"><div><h2><TrendingUp size={18} /> Market intelligence</h2><p>The largest 24-hour moves in the active AD88 universe.</p></div><Link to="/app/market" className="link-action">Explore markets <ArrowRight size={16} /></Link></div>
          <div className="market-intelligence-list">{topMoves.map((asset) => <Link to={`/app/market?symbol=${asset.symbol}`} className="market-intelligence-item" key={asset.symbol}><span className="market-intelligence-item__symbol">{asset.symbol}</span><span>{asset.name}</span><strong>{formatCurrency(asset.price)}</strong><em className={asset.change24h >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(asset.change24h)}</em></Link>)}</div>
          <div className="market-intelligence-panel__event"><span>Next scheduled signal</span><strong>{nextEvent ? nextEvent.title : 'Market calendar is synchronizing'}</strong><small>{nextEvent ? `${nextEvent.market} · ${nextEvent.country} · ${formatDateTime(nextEvent.scheduledAt)}` : 'Research events will appear here when available.'}</small></div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head"><div><h2>Research briefing</h2><p>Institutional-style context for the assets and countries shaping the next session.</p></div><Link to="/app/news" className="link-action">Full research <ArrowRight size={16} /></Link></div>
          {researchItems.length ? <div className="research-briefing-list">{researchItems.map((item) => <Link to={item.targetPath || '/app/news'} key={item.id} className="research-briefing-item"><span className="eyebrow">{item.category} · {item.country}</span><strong>{item.title}</strong><p>{item.summary}</p><footer><span>{item.markets.join(' · ')}</span><StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{item.impact} impact</StatusPill></footer></Link>)}</div> : <EmptyState title="Research is synchronizing" text="The next market brief will appear here as soon as the research feed is available." />}
        </article>

        <article className="panel">
          <div className="panel__head"><div><h2>Recent account activity</h2><p>Only real paper-account events appear here; new accounts begin with a clean activity record.</p></div><Link to="/app/ledger" className="link-action">View activity <ArrowRight size={16} /></Link></div>
          {ledger.data.entries.length ? <div className="stack-list">{ledger.data.entries.slice(0, 5).map((entry) => <div key={entry.id} className="stack-list__row"><div><strong>{entry.refId}</strong><span>{entry.note}</span></div><div className="stack-list__meta"><StatusPill tone={entry.status === 'approved' ? 'success' : entry.status === 'pending' ? 'warning' : entry.status === 'rejected' ? 'critical' : 'info'}>{entry.status}</StatusPill><span>{formatDateTime(entry.time)}</span></div></div>)}</div> : <EmptyState title="No account activity" text="Funding and withdrawal events will be recorded here once they are initiated." />}
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head"><div><h2>Margin review history</h2><p>Recent requests remain visible across devices and the administrator console.</p></div></div>
          {recentCreditRequests.length ? <div className="stack-list">{recentCreditRequests.map((request) => <div key={request.id} className="stack-list__row"><div><strong>{request.amount} U</strong><span>{request.reason}</span></div><div className="stack-list__meta"><StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>{request.status}</StatusPill><span>{formatDateTime(request.requestedAt)}</span></div></div>)}</div> : <EmptyState title="No review requests" text="You can submit a paper-margin review from the account controls above." />}
        </article>
        <article className="panel command-center__alerts">
          <div className="panel__head"><div><h2>Workspace alerts</h2><p>System, market and account notifications remain actionable instead of decorative.</p></div><Link to="/app/notifications" className="link-action">Open alerts <ArrowRight size={16} /></Link></div>
          {notifications.data.items.length ? <div className="stack-list">{notifications.data.items.slice(0, 4).map((item) => <div key={item.id} className="stack-list__row"><div><strong>{item.title}</strong><span>{item.body}</span></div><div className="stack-list__meta"><StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? 'Read' : 'Unread'}</StatusPill><span>{formatDateTime(item.createdAt)}</span></div></div>)}</div> : <EmptyState title="No alerts" text="Relevant notifications will be collected here as activity occurs." />}
        </article>
      </section>
    </div>
  );
}
