import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, HandCoins, TrendingUp, WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { Sparkline } from '@/components/Charts';
import { MarketTicker } from '@/components/MarketTicker';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatCurrency, formatPercent, formatCompact, formatDateTime } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { createCreditRequest, ensureCreditAccount, readCreditRequests } from '@/lib/credits';
import type { CreditAccount, CreditRequest } from '@/types';

export function DashboardPage() {
  const { session } = useAuth();
  const market = useAsyncResource(() => loadMarketBundle('BTC'), []);
  const ledger = useAsyncResource(() => loadLedgerBundle(), []);
  const notifications = useAsyncResource(() => loadNotificationBundle(), []);
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState('交易额度补充');
  const [creditVersion, setCreditVersion] = useState(0);
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);

  useEffect(() => {
    if (!session) return;
    const { account } = ensureCreditAccount(session);
    const requests = readCreditRequests().filter((request) => request.userId === session.id);
    const pending = requests.filter((request) => request.status === 'pending').reduce((sum, request) => sum + request.amount, 0);
    setCreditAccount({ ...account, pending });
    setCreditRequests(requests);
  }, [creditVersion, session]);

  if ([market, ledger, notifications].some((resource) => resource.status === 'loading')) {
    return <LoadingState label="正在整理仪表盘" />;
  }

  if (market.status === 'error' || ledger.status === 'error' || notifications.status === 'error') {
    return (
      <div className="state-block state-block--error">
        <strong>仪表盘暂不可用</strong>
        <p>部分数据源未能返回，请稍后再试。</p>
      </div>
    );
  }

  if (market.status !== 'success' || ledger.status !== 'success' || notifications.status !== 'success') {
    return <LoadingState label="正在整理仪表盘" />;
  }

  const marketData = market.data;
  const ledgerData = ledger.data;
  const notificationData = notifications.data;

  const totalAssets = creditAccount?.balance ?? 0;
  const todayChange = 0;
  const portfolio: Array<{ symbol: string; units: number; value: number; delta: number; price: number }> = [];
  const openOrders = ledgerData.entries.filter((entry) => entry.status === 'pending').length;
  const unread = notificationData.items.filter((item) => !item.read).length;
  const trendSeries = marketData.candles.slice(-12).map((item) => item.close);
  const recentCreditRequests = creditRequests.slice(0, 3);

  const submitCreditRequest = () => {
    if (!session) return;
    const amount = Math.max(1, Math.round(creditAmount));
    createCreditRequest(session, amount, creditReason.trim() || '交易额度补充');
    setCreditAmount(100);
    setCreditReason('交易额度补充');
    setCreditVersion((value) => value + 1);
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="总览"
        title="仪表盘"
        description="实时市场、纸上持仓、资金状态和通知放在一张工作台上。"
        actions={
          <>
            <Link to="/app/market" className="btn btn--ghost">
              <BriefcaseBusiness size={16} />
              查看交易
            </Link>
          </>
        }
      />

      <MarketTicker assets={marketData.assets} />

      <section className="metric-grid">
        <StatCard label="资产总额" value={formatCurrency(totalAssets)} delta={totalAssets ? formatPercent(todayChange) : undefined} note={totalAssets ? '按可用 U 额度显示' : '暂无 U，资产为 0'} />
        <StatCard label="今日涨跌" value={formatPercent(todayChange)} note="基于仓位加权" />
        <StatCard label="待审核流水" value={String(openOrders)} note="资金与复核" />
        <StatCard label="可用 U" value={String(creditAccount?.available ?? 0)} note={`待审 ${creditAccount?.pending ?? 0} U`} />
      </section>

      <section className="dashboard-visual-band">
        <article className="market-mural">
          <img src="/assets/trading-workstation-hero.png" alt="" className="market-mural__image" />
          <div>
            <span className="eyebrow">AD88 market pulse</span>
            <h2>实时价格与账户状态</h2>
            <p>交易资产、可用 U 额度和客服消息都会在同一工作区保持清晰分层。</p>
          </div>
          <Sparkline values={trendSeries} positive={todayChange >= 0} />
        </article>
        <article className="action-rail">
          <Link to="/app/market" className="action-rail__item">
            <TrendingUp size={18} />
            <span>打开交易台并做多/做空测算</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/app/ledger" className="action-rail__item">
            <BriefcaseBusiness size={18} />
            <span>查看资金流水与审核</span>
            <ArrowRight size={16} />
          </Link>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel credit-console">
          <div className="panel__head">
            <div>
              <h2>U 账户</h2>
              <p>前台可以申请 U，后台审核后会进入可用余额。</p>
            </div>
            <StatusPill tone="info"><WalletCards size={14} /> {String(creditAccount?.balance ?? 0)}</StatusPill>
          </div>
          <div className="credit-balance-grid">
            <StatCard label="账户余额" value={String(creditAccount?.balance ?? 0)} note="累计 U" />
            <StatCard label="可用 U" value={String(creditAccount?.available ?? 0)} note="可用于交易额度" />
            <StatCard label="待审核" value={String(creditAccount?.pending ?? 0)} note="申请中" />
          </div>
          <div className="form-grid">
            <label className="field">
              <span>申请 U</span>
              <input type="number" min="1" step="1" value={creditAmount} onChange={(event) => setCreditAmount(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>申请用途</span>
              <input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} />
            </label>
          </div>
          <button type="button" className="btn btn--primary" onClick={submitCreditRequest}>
            <HandCoins size={16} />
            提交 U 申请
          </button>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>U 申请记录</h2>
              <p>最近申请会同步到后台审核台。</p>
            </div>
            <StatusPill tone={recentCreditRequests.some((item) => item.status === 'pending') ? 'warning' : 'muted'}>
              {recentCreditRequests.length ? `${recentCreditRequests.length} 条` : '暂无'}
            </StatusPill>
          </div>
          {recentCreditRequests.length ? (
            <div className="stack-list">
              {recentCreditRequests.map((request) => (
                <div key={request.id} className="stack-list__row">
                  <div>
                    <strong>{request.amount} U</strong>
                    <span>{request.reason}</span>
                  </div>
                  <div className="stack-list__meta">
                    <StatusPill tone={request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'critical'}>
                      {request.status}
                    </StatusPill>
                    <span>{formatDateTime(request.requestedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="state-block">
              <strong>还没有 U 申请</strong>
              <p>输入数量后提交，后台就能看到并处理。</p>
            </div>
          )}
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>持仓摘要</h2>
              <p>仓位与估值的关系一目了然。</p>
            </div>
            <StatusPill tone={todayChange >= 0 ? 'success' : 'critical'}>{formatPercent(todayChange)}</StatusPill>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>资产</th>
                  <th className="text-end">持仓</th>
                  <th className="text-end">现价</th>
                  <th className="text-end">估值</th>
                  <th className="text-end">浮动</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.length ? portfolio.map((item) => (
                  <tr key={item.symbol}>
                    <td>
                      <strong>{item.symbol}</strong>
                      <div className="text-small text-muted">{item.symbol} / spot</div>
                    </td>
                    <td className="text-end">{item.units.toFixed(2)}</td>
                    <td className="text-end">{formatCurrency(item.price)}</td>
                    <td className="text-end">{formatCurrency(item.value)}</td>
                    <td className="text-end">
                      <span className={item.delta >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(item.delta)}</span>
                    </td>
                  </tr>
                )) : <tr><td colSpan={5}><div className="empty-inline"><WalletCards size={18} /><span>暂无资产。U 通过后台审核后，资产额度会自动显示。</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>趋势预览</h2>
              <p>最近 12 个采样点。</p>
            </div>
            <Link to="/app/notifications" className="link-action">
              查看通知 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="panel__chart">
            <Sparkline values={trendSeries} positive={todayChange >= 0} />
          </div>
          <div className="mini-grid">
            <StatCard label="总成交量" value={formatCompact(marketData.selected.volume24h)} note="24h" />
            <StatCard label="订单状态" value={String(ledgerData.entries.filter((entry) => entry.status === 'approved').length)} note="已通过" />
            <StatCard label="未读通知" value={String(unread)} note="需要处理" />
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>订单摘要</h2>
              <p>资金流水、审核和模拟出入金的当前切面。</p>
            </div>
            <Link to="/app/ledger" className="link-action">
              查看流水 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="stack-list">
            {ledgerData.entries.slice(0, 4).map((entry) => (
              <div key={entry.id} className="stack-list__row">
                <div>
                  <strong>{entry.refId}</strong>
                  <span>{entry.note}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={entry.status === 'approved' ? 'success' : entry.status === 'pending' ? 'warning' : entry.status === 'rejected' ? 'critical' : 'info'}>
                    {entry.status}
                  </StatusPill>
                  <span>{formatDateTime(entry.time)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>通知摘要</h2>
              <p>点击通知可跳转到相关页面。</p>
            </div>
            <Link to="/app/notifications" className="link-action">
              通知中心 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="stack-list">
            {notificationData.items.slice(0, 4).map((item) => (
              <div key={item.id} className="stack-list__row">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
                <div className="stack-list__meta">
                  <StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? '已读' : '未读'}</StatusPill>
                  <span>{formatDateTime(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
