import type { ReactNode } from 'react';
import { Activity, Clock3, Database, GitBranch, ShieldCheck, Wifi } from 'lucide-react';
import type { SourceMeta } from '@/types';
import { formatDateTime } from '@/lib/format';
import { useLanguage } from '@/context/language-context';

export function StatCard({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta?: string;
  note?: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {delta ? <span className="stat-card__delta">{delta}</span> : null}
      {note ? <span className="stat-card__note">{note}</span> : null}
    </article>
  );
}

export function DataMeta({
  source,
  refreshing = false,
  refreshError = null,
}: {
  source: SourceMeta;
  refreshing?: boolean;
  refreshError?: string | null;
}) {
  const { t } = useLanguage();
  const state = source.dataState ?? (source.mode === 'broker' ? 'broker' : source.mode === 'mock' ? 'fallback' : source.cacheState === 'cached' ? 'cached' : 'live');
  const stateMeta = {
    broker: { label: t('data.brokerFeed'), tone: 'success' as const, description: t('data.brokerDescription') },
    live: { label: t('data.liveApi'), tone: 'success' as const, description: t('data.liveDescription') },
    cached: { label: t('data.cached'), tone: 'warning' as const, description: t('data.cachedDescription') },
    fallback: { label: t('data.fallback'), tone: 'warning' as const, description: t('data.fallbackDescription') },
    paper: { label: t('data.paperEnvironment'), tone: 'info' as const, description: t('data.paperDescription') },
  }[state];
  // A live quote snapshot can remain healthy while an optional historical
  // candle provider is unavailable. Keep the trust signal tied to the data
  // driving the ticket; chart fallback state is still shown separately.
  const effectiveHealth = source.health === 'offline' && (state === 'live' || state === 'broker') ? 'healthy' : source.health;
  const healthTone = effectiveHealth === 'offline' ? 'critical' : stateMeta.tone;
  const cacheLabel = source.cacheState === 'fresh'
    ? t('data.cacheFresh')
    : source.cacheState === 'cached'
      ? t('data.cacheCached')
      : source.cacheState === 'stale'
        ? t('data.cacheStale')
        : t('data.cacheOffline');
  const lineage = source.lineage || t('data.lineageUnavailable');
  return (
    <section className="data-integrity" aria-label={t('data.marketIntegrity')}>
      <span className={`data-integrity__state data-integrity__state--${stateMeta.tone}`} title={stateMeta.description}><Activity size={14} /> {stateMeta.label}</span>
      <span className="data-integrity__item data-integrity__item--provider" title={source.provider}><Database size={14} /><span><small>{t('data.provider')}</small><strong>{source.provider || '—'}</strong></span></span>
      <span className="data-integrity__item"><Clock3 size={14} /><span><small>{t('data.lastVerified')}</small><strong>{formatDateTime(source.updatedAt)}</strong></span></span>
      <span className="data-integrity__item"><Database size={14} /><span><small>{t('data.cache')}</small><strong>{cacheLabel}</strong></span></span>
      <span className="data-integrity__item"><Wifi size={14} /><span><small>{t('data.connection')}</small><strong className={`data-meta__status data-meta__status--${healthTone}`}>{effectiveHealth === 'offline' ? t('data.reviewNeeded') : effectiveHealth === 'degraded' ? t('data.monitoring') : t('data.stable')}</strong></span></span>
      <span className="data-integrity__item"><ShieldCheck size={14} /><span><small>{t('data.execution')}</small><strong>{t('data.paperSafeguarded')}</strong></span></span>
      <span className={`data-integrity__item data-integrity__item--lineage ${refreshError ? 'data-integrity__item--error' : ''}`} title={refreshError || lineage}><GitBranch size={14} /><span><small>{refreshError ? t('data.refreshStatus') : t('data.lineage')}</small><strong>{refreshError ? t('data.refreshError') : lineage}</strong></span></span>
      {refreshing ? <span className="data-integrity__refresh" role="status" aria-live="polite"><span className="status-dot status-dot--live" />{t('data.refreshing')}</span> : null}
    </section>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'critical' | 'info' | 'muted';
  children: ReactNode;
}) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block">
      <strong>{title}</strong>
      <p>{text}</p>
      {action ? <div className="state-block__action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load this workspace',
  text,
  action,
}: {
  title?: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block state-block--error">
      <strong>{title}</strong>
      <p>{text}</p>
      {action ? <div className="state-block__action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Preparing your workspace' }: { label?: string }) {
  return (
    <div className="skeleton-stack" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton__label">{label}</div>
    </div>
  );
}
