import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import type { TradeAuditEvent } from '@/types';

const filters = ['全部', 'deposit', 'withdraw', 'transfer', 'review'] as const;

export function LedgerPage() {
  const bundle = useAsyncResource(() => loadLedgerBundle(), []);
  const trades = useAsyncResource(() => apiFetch<TradeAuditEvent[]>('/api/trades'), []);
  const [filter, setFilter] = useState<(typeof filters)[number]>('全部');

  const filtered = useMemo(() => {
    if (bundle.status !== 'success') return [];
    return bundle.data.entries.filter((entry) => filter === '全部' || entry.type === filter);
  }, [bundle, filter]);

  if (bundle.status === 'loading' || trades.status === 'loading') {
    return <LoadingState label="正在载入资金流水" />;
  }

  if (bundle.status === 'error' || trades.status === 'error') {
    return <div className="state-block state-block--error"><strong>流水页暂时不可用</strong><p>{bundle.error}</p></div>;
  }

  if (bundle.status !== 'success' || trades.status !== 'success') return <LoadingState label="正在载入账户记录" />;

  const approved = bundle.data.entries.filter((entry) => entry.status === 'approved' || entry.status === 'settled');
  const pending = bundle.data.entries.filter((entry) => entry.status === 'pending');
  const inflow = bundle.data.entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0);
  const outflow = bundle.data.entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="账本"
        title="资金流水"
        description="只显示该账户实际产生的入金、出金与处理状态。"
        meta={<DataMeta source={bundle.data.source} />}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label="入金合计" value={`${inflow.toFixed(2)} U`} note="已记录资金变动" />
        <StatCard label="出金合计" value={`${outflow.toFixed(2)} U`} note="已记录资金变动" />
        <StatCard label="已通过/已结清" value={String(approved.length)} note="审核结果" />
        <StatCard label="待审核" value={String(pending.length)} note="人工复核" />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {filters.map((item) => (
            <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th className="text-end">金额</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>引用 ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.time)}</td>
                    <td>{entry.type}</td>
                    <td className="text-end">{entry.amount.toFixed(2)} {entry.currency}</td>
                    <td>
                      <StatusPill tone={entry.status === 'approved' || entry.status === 'settled' ? 'success' : entry.status === 'pending' ? 'warning' : 'critical'}>
                        {entry.status}
                      </StatusPill>
                    </td>
                    <td>{entry.note}</td>
                    <td>{entry.refId}</td>
                  </tr>
                )) : <tr><td colSpan={6}><div className="empty-inline"><span>暂无资金流水。发生入金或出金后会在这里显示。</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>交易记录</h2>
              <p>开仓、部分平仓和完整平仓会同步显示在这里。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>时间</th><th>品种</th><th>操作</th><th>手数</th><th className="text-end">成交价</th><th className="text-end">盈亏 U</th></tr></thead>
              <tbody>
                {trades.data.length ? trades.data.map((trade) => {
                  const closed = trade.action === 'close' || trade.action === 'partial-close';
                  return <tr key={trade.id}>
                    <td>{formatDateTime(trade.createdAt)}</td>
                    <td><strong>{trade.symbol}</strong><div className="text-small text-muted">{trade.side === 'long' ? '做多' : '做空'}</div></td>
                    <td><StatusPill tone={closed ? 'info' : 'success'}>{trade.action === 'open' ? '开仓' : trade.action === 'partial-close' ? '部分平仓' : trade.action === 'close' ? '平仓' : '风控更新'}</StatusPill></td>
                    <td>{trade.lots.toFixed(2)}</td>
                    <td className="text-end">{trade.price.toFixed(4)}</td>
                    <td className={`text-end ${trade.pnl == null ? 'text-muted' : trade.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}`}>{trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U`}</td>
                  </tr>;
                }) : <tr><td colSpan={6}><div className="empty-inline"><span>暂无交易记录。开仓或平仓后会在这里显示。</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
