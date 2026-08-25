import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import type { TradeAuditEvent } from '@/types';
import { useLanguage } from '@/context/language-context';

const tradeFilters = ['All', 'open', 'close', 'partial-close', 'liquidation'] as const;

function actionTranslationKey(action: TradeAuditEvent['action']) {
  if (action === 'open') return 'ledger.open';
  if (action === 'partial-close') return 'ledger.partialClose';
  if (action === 'close') return 'ledger.close';
  if (action === 'liquidation') return 'ledger.liquidation';
  return 'ledger.riskUpdate';
}

export function LedgerPage() {
  const { t } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState<(typeof tradeFilters)[number]>('All');
  const trades = useAsyncResource(() => apiFetch<TradeAuditEvent[]>('/api/trades'), [refreshKey]);

  const visibleTrades = useMemo(() => {
    if (trades.status !== 'success') return [];
    return trades.data.filter((trade) => filter === 'All' || trade.action === filter);
  }, [filter, trades]);

  if (trades.status === 'loading') return <LoadingState label={t('ledger.loading')} />;
  if (trades.status === 'error') return <div className="state-block state-block--error"><strong>{t('ledger.error')}</strong><p>{trades.error}</p></div>;
  if (trades.status !== 'success') return <LoadingState label={t('ledger.loading')} />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('ledger.eyebrow')}
        title={t('ledger.title')}
        description={t('ledger.description')}
        actions={<button type="button" className="btn btn--ghost btn--sm" onClick={() => setRefreshKey((value) => value + 1)}>{t('action.refresh')}</button>}
      />

      <section className="panel trade-history-panel">
        <div className="panel__head">
          <div><span className="eyebrow">{t('ledger.tradeAudit')}</span><h2>{t('ledger.tradeAudit')}</h2><p>{t('ledger.tradeAuditHint')}</p></div>
          <div className="chip-row">{tradeFilters.map((item) => <button key={item} type="button" className={`chip ${filter === item ? 'is-active' : ''}`} onClick={() => setFilter(item)}>{item === 'All' ? t('ledger.allActivity') : t(actionTranslationKey(item))}</button>)}</div>
        </div>
        <div className="table-wrap trade-history-scroll" tabIndex={0}>
          <table className="table table--interactive">
            <thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.instrument')}</th><th>{t('ledger.action')}</th><th>{t('ledger.lots')}</th><th className="text-end">{t('ledger.referencePrice')}</th><th className="text-end">{t('ledger.pnl')}</th></tr></thead>
            <tbody>
              {visibleTrades.length ? visibleTrades.map((trade) => {
                const closed = trade.action === 'close' || trade.action === 'partial-close' || trade.action === 'liquidation';
                return <tr key={trade.id}><td>{formatDateTime(trade.createdAt)}</td><td><strong>{trade.symbol}</strong><div className="text-small text-muted">{trade.side === 'long' ? t('market.long') : t('market.short')}</div></td><td><StatusPill tone={trade.action === 'liquidation' ? 'critical' : closed ? 'info' : 'success'}>{t(actionTranslationKey(trade.action))}</StatusPill></td><td>{trade.lots.toFixed(2)}</td><td className="text-end">{trade.price.toFixed(4)}</td><td className={`text-end ${trade.pnl == null ? 'text-muted' : trade.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}`}>{trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} U`}</td></tr>;
              }) : <tr><td colSpan={6}><div className="empty-inline"><span>{t('ledger.noTrades')}</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
