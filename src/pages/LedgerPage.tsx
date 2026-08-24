import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import type { TradeAuditEvent } from '@/types';

const filters = ['All', 'deposit', 'withdraw', 'transfer', 'review'] as const;

export function LedgerPage() {
  const bundle = useAsyncResource(() => loadLedgerBundle(), []);
  const trades = useAsyncResource(() => apiFetch<TradeAuditEvent[]>('/api/trades'), []);
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');

  const filtered = useMemo(() => {
    if (bundle.status !== 'success') return [];
    return bundle.data.entries.filter((entry) => filter === 'All' || entry.type === filter);
  }, [bundle, filter]);

  if (bundle.status === 'loading' || trades.status === 'loading') {
    return <LoadingState label="Loading account activity" />;
  }

  if (bundle.status === 'error' || trades.status === 'error') {
    return <div className="state-block state-block--error"><strong>Account activity is temporarily unavailable</strong><p>{bundle.error}</p></div>;
  }

  if (bundle.status !== 'success' || trades.status !== 'success') return <LoadingState label="Loading account records" />;

  const approved = bundle.data.entries.filter((entry) => entry.status === 'approved' || entry.status === 'settled');
  const pending = bundle.data.entries.filter((entry) => entry.status === 'pending');
  const inflow = bundle.data.entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0);
  const outflow = bundle.data.entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ACCOUNT ACTIVITY"
        title="Funding & Trade Audit"
        description="A clean account-level record of paper funding requests, withdrawals and trade events."
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label="Total funding" value={`${inflow.toFixed(2)} U`} note="Recorded account inflows" />
        <StatCard label="Total withdrawals" value={`${outflow.toFixed(2)} U`} note="Recorded account outflows" />
        <StatCard label="Approved / settled" value={String(approved.length)} note="Completed review outcomes" />
        <StatCard label="In review" value={String(pending.length)} note="Awaiting administrator review" />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {filters.map((item) => (
            <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>
              {item === 'All' ? 'All activity' : item}
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
                  <th>Time</th>
                  <th>Type</th>
                  <th className="text-end">Amount</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Reference ID</th>
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
                )) : <tr><td colSpan={6}><div className="empty-inline"><span>No funding activity yet. Events appear here only after they are initiated.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>Trade audit</h2>
              <p>Open, partial-close and close events remain synchronized here.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Time</th><th>Instrument</th><th>Action</th><th>Lots</th><th className="text-end">Reference price</th><th className="text-end">PnL (U)</th></tr></thead>
              <tbody>
                {trades.data.length ? trades.data.map((trade) => {
                  const closed = trade.action === 'close' || trade.action === 'partial-close';
                  return <tr key={trade.id}>
                    <td>{formatDateTime(trade.createdAt)}</td>
                    <td><strong>{trade.symbol}</strong><div className="text-small text-muted">{trade.side === 'long' ? 'Long' : 'Short'}</div></td>
                    <td><StatusPill tone={closed ? 'info' : 'success'}>{trade.action === 'open' ? 'Open' : trade.action === 'partial-close' ? 'Partial close' : trade.action === 'close' ? 'Close' : 'Risk update'}</StatusPill></td>
                    <td>{trade.lots.toFixed(2)}</td>
                    <td className="text-end">{trade.price.toFixed(4)}</td>
                    <td className={`text-end ${trade.pnl == null ? 'text-muted' : trade.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}`}>{trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U`}</td>
                  </tr>;
                }) : <tr><td colSpan={6}><div className="empty-inline"><span>No trade audit events yet. Opening or closing a paper position records an event here.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
