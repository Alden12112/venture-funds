import { useEffect, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { formatDateTime } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import type { TimedMarketScenario } from '@/types';
import { useLanguage } from '@/context/language-context';

function formatObservationDuration(seconds: number, t: (key: string) => string) {
  if (seconds >= 60 * 60) {
    const hours = Math.floor(seconds / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    return `${hours}${t('market.scenarioHours')}${minutes ? ` ${minutes}${t('market.scenarioMinutes')}` : ''}`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}${t('market.scenarioMinutes')}${seconds % 60 ? ` ${seconds % 60}${t('market.scenarioSeconds')}` : ''}`;
  }
  return `${seconds}${t('market.scenarioSeconds')}`;
}

function observationResult(scenario: TimedMarketScenario, t: (key: string) => string) {
  if (scenario.status === 'active') return t('ledger.observationPending');
  if (scenario.status === 'void') return t('ledger.observationCancelled');
  if (scenario.result === 'confirmed') return t('market.scenarioConfirmed');
  if (scenario.result === 'not-confirmed') return t('market.scenarioNotConfirmed');
  if (scenario.result === 'flat') return t('market.scenarioFlat');
  return t('ledger.observationRecorded');
}

function observationResultTone(scenario: TimedMarketScenario) {
  if (scenario.status === 'active') return 'warning' as const;
  if (scenario.status === 'void' || scenario.result === 'not-confirmed') return 'critical' as const;
  if (scenario.result === 'confirmed') return 'success' as const;
  return 'info' as const;
}

function observationDetail(scenario: TimedMarketScenario, t: (key: string) => string) {
  const direction = scenario.direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown');
  const result = observationResult(scenario, t);
  const note = scenario.status === 'settled' && scenario.adminNote
    ? ` · ${t('ledger.observationNote')}: ${scenario.adminNote}`
    : '';
  return `${direction} · ${result}${note}`;
}

export function LedgerPage() {
  const { t } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  const scenarios = useAsyncResource(() => apiFetch<TimedMarketScenario[]>('/api/market-scenarios'), [refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 2_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') setRefreshKey((value) => value + 1);
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  if (scenarios.status === 'loading') return <LoadingState label={t('ledger.loading')} />;
  if (scenarios.status === 'error') return <div className="state-block state-block--error"><strong>{t('ledger.error')}</strong><p>{scenarios.error}</p></div>;
  if (scenarios.status !== 'success') return <LoadingState label={t('ledger.loading')} />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('ledger.observationEyebrow')}
        title={t('ledger.observationTitle')}
        description={t('ledger.observationDescription')}
        actions={<button type="button" className="btn btn--ghost btn--sm" onClick={() => setRefreshKey((value) => value + 1)} disabled={scenarios.refreshing} aria-busy={scenarios.refreshing}><RefreshCw size={15} className={scenarios.refreshing ? 'spin' : ''} /> {t('action.refresh')}</button>}
      />

      <section className="panel trade-history-panel observation-ledger-panel">
        <div className="panel__head">
          <div><span className="eyebrow">{t('ledger.observationEyebrow')}</span><h2>{t('ledger.observationRecords')}</h2><p>{t('ledger.observationHint')}</p></div>
          <StatusPill tone={scenarios.data.length ? 'info' : 'muted'}>{scenarios.data.length} {t('ledger.observationRecords')}</StatusPill>
        </div>
        {scenarios.refreshError ? <div className="notice-banner notice-banner--warning" role="status"><Clock3 size={15} /><span>{t('data.refreshError')}</span></div> : null}
        <div className="table-wrap trade-history-scroll observation-ledger-scroll" tabIndex={0}>
          <table className="table table--interactive">
            <thead><tr><th>{t('ledger.time')}</th><th>{t('ledger.instrument')}</th><th>{t('ledger.observationDuration')}</th><th className="text-end">{t('ledger.observationAmount')}</th><th>{t('ledger.observationResult')}</th></tr></thead>
            <tbody>
              {scenarios.data.length ? scenarios.data.map((scenario) => (
                <tr key={scenario.id}>
                  <td>{formatDateTime(scenario.createdAt)}</td>
                  <td><strong>{scenario.symbol}</strong><div className="text-small text-muted">{scenario.direction === 'up' ? t('market.scenarioUp') : t('market.scenarioDown')}</div></td>
                  <td>{formatObservationDuration(scenario.durationSeconds, t)}</td>
                  <td className="text-end"><strong>{scenario.observationPoints} USDT</strong></td>
                  <td><div className="observation-result-cell"><StatusPill tone={observationResultTone(scenario)}>{observationResult(scenario, t)}</StatusPill><span>{observationDetail(scenario, t)}</span></div></td>
                </tr>
              )) : <tr><td colSpan={5}><div className="empty-inline"><span>{t('ledger.noObservations')}</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
