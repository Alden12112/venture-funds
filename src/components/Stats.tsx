import type { ReactNode } from 'react';
import { Activity, Clock3, ShieldCheck, Wifi } from 'lucide-react';
import type { SourceMeta } from '@/types';
import { formatDateTime } from '@/lib/format';

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

export function DataMeta({ source }: { source: SourceMeta }) {
  const state = source.dataState ?? (source.mode === 'broker' ? 'broker' : source.mode === 'mock' ? 'fallback' : source.cacheState === 'cached' ? 'cached' : 'live');
  const stateMeta = {
    broker: { label: 'Broker Feed', tone: 'success' as const, description: 'Read-only reference prices are arriving from the connected terminal.' },
    live: { label: 'Live API', tone: 'success' as const, description: 'Normalized market data is available for this workspace.' },
    cached: { label: 'Cached', tone: 'warning' as const, description: 'The most recent verified market snapshot is being retained.' },
    fallback: { label: 'Fallback', tone: 'warning' as const, description: 'A resilient reference is in use while an upstream source recovers.' },
    paper: { label: 'Paper Environment', tone: 'info' as const, description: 'Orders, margin and PnL remain simulated.' },
  }[state];
  const healthTone = source.health === 'offline' ? 'critical' : stateMeta.tone;
  return (
    <section className="data-integrity" aria-label="Market data integrity">
      <span className={`data-integrity__state data-integrity__state--${stateMeta.tone}`} title={stateMeta.description}><Activity size={14} /> {stateMeta.label}</span>
      <span className="data-integrity__item"><Clock3 size={14} /><span><small>Last verified</small><strong>{formatDateTime(source.updatedAt)}</strong></span></span>
      <span className="data-integrity__item"><Wifi size={14} /><span><small>Connection</small><strong className={`data-meta__status data-meta__status--${healthTone}`}>{source.health === 'offline' ? 'Review needed' : source.health === 'degraded' ? 'Monitoring' : 'Stable'}</strong></span></span>
      <span className="data-integrity__item"><ShieldCheck size={14} /><span><small>Execution</small><strong>Paper safeguarded</strong></span></span>
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
