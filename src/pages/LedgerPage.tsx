import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadLedgerBundle } from '@/adapters/ledger-adapter';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import type { TradeAuditEvent } from '@/types';
import { useLanguage } from '@/context/language-context';

const filters = ['All', 'deposit', 'withdraw', 'transfer', 'review'] as const;

const ledgerTypeKeys: Record<(typeof filters)[number], string> = {
  All: 'ledger.allActivity',
  deposit: 'ledger.deposit',
  withdraw: 'ledger.withdraw',
  transfer: 'ledger.transfer',
  review: 'ledger.review',
};

const statusKeys: Record<string, string> = {
  approved: 'status.approved',
  settled: 'status.settled',
  pending: 'status.pending',
  rejected: 'status.rejected',
};

export function LedgerPage() {
  const { t } = useLanguage();
  const bundle = useAsyncResource(() => loadLedgerBundle(), []);
  const trades = useAsyncResource(() => apiFetch<TradeAuditEvent[]>('/api/trades'), []);
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');

  const filtered = useMemo(() => {
    if (bundle.status !== 'success') return [];
    return bundle.data.entries.filter((entry) => filter === 'All' || entry.type === filter);
  }, [bundle, filter]);

  if (bundle.status === 'loading' || trades.status === 'loading') {
    return <LoadingState label={t('ledger.loading')} />;
  }

  if (bundle.status === 'error' || trades.status === 'error') {
    return <div className="state-block state-block--error"><strong>{t('ledger.error')}</strong><p>{bundle.error}</p></div>;
  }

  if (bundle.status !== 'success' || trades.status !== 'success') return <LoadingState label={t('ledger.loading')} />;

  const approved = bundle.data.entries.filter((entry) => entry.status === 'approved' || entry.status === 'settled');
  const pending = bundle.data.entries.filter((entry) => entry.status === 'pending');
  const inflow = bundle.data.entries.filter((entry) => entry.direction === 'in').reduce((sum, entry) => sum + entry.amount, 0);
  const outflow = bundle.data.entries.filter((entry) => entry.direction === 'out').reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('ledger.eyebrow')}
        title={t('ledger.title')}
        description={t('ledger.description')}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('ledger.totalFunding')} value={`${inflow.toFixed(2)} U`} note={t('ledger.totalFundingHint')} />
        <StatCard label={t('ledger.totalWithdrawals')} value={`${outflow.toFixed(2)} U`} note={t('ledger.totalWithdrawalsHint')} />
        <StatCard label={t('ledger.approvedSettled')} value={String(approved.length)} note={t('ledger.approvedSettledHint')} />
        <StatCard label={t('ledger.inReview')} value={String(pending.length)} note={t('ledger.inReviewHint')} />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {filters.map((item) => (
            <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>
              {t(ledgerTypeKeys[item])}
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
                  <th>{t('ledger.time')}</th>
                  <th>{t('ledger.type')}</th>
                  <th className="text-end">{t('ledger.amount')}</th>
                  <th>{t('ledger.status')}</th>
                  <th>{t('ledger.note')}</th>
                  <th>{t('ledger.referenceId')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.time)}</td>
                    <td>{ledgerTypeKeys[entry.type as (typeof filters)[number]] ? t(ledgerTypeKeys[entry.type as (typeof filters)[number]]) : entry.type}</td>
                    <td className="text-end">{entry.amount.toFixed(2)} {entry.currency}</td>
                    <td>
                      <StatusPill tone={entry.status === 'approved' || entry.status === 'settled' ? 'success' : entry.status === 'pending' ? 'warning' : 'critical'}>
                        {statusKeys[entry.status] ? t(statusKeys[entry.status]) : entry.status}
                      </StatusPill>
                    </td>
                    <td>{entry.note}</td>
                    <td>{entry.refId}</td>
                  </tr>
                )) : <tr><td colSpan={6}><div className="empty-inline"><span>{t('ledger.noFunding')}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('ledger.tradeAudit')}</h2>
              <p>{t('ledger.tradeAuditHint')}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.instrument')}</th><th>{t('ledger.action')}</th><th>{t('ledger.lots')}</th><th className="text-end">{t('ledger.referencePrice')}</th><th className="text-end">{t('ledger.pnl')}</th></tr></thead>
              <tbody>
                {trades.data.length ? trades.data.map((trade) => {
                  const closed = trade.action === 'close' || trade.action === 'partial-close';
                  return <tr key={trade.id}>
                    <td>{formatDateTime(trade.createdAt)}</td>
                     <td><strong>{trade.symbol}</strong><div className="text-small text-muted">{trade.side === 'long' ? t('market.long') : t('market.short')}</div></td>
                     <td><StatusPill tone={closed ? 'info' : 'success'}>{trade.action === 'open' ? t('ledger.open') : trade.action === 'partial-close' ? t('ledger.partialClose') : trade.action === 'close' ? t('ledger.close') : t('ledger.riskUpdate')}</StatusPill></td>
                    <td>{trade.lots.toFixed(2)}</td>
                    <td className="text-end">{trade.price.toFixed(4)}</td>
                    <td className={`text-end ${trade.pnl == null ? 'text-muted' : trade.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}`}>{trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U`}</td>
                  </tr>;
                 }) : <tr><td colSpan={6}><div className="empty-inline"><span>{t('ledger.noTrades')}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
