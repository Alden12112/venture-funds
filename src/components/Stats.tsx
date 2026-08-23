import type { ReactNode } from 'react';
import { Activity, Clock3, Database, GitBranch, Gauge } from 'lucide-react';
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

export function DataMeta({ source }: { source: SourceMeta }) {
  const { t } = useLanguage();
  const cacheTone = source.cacheState === 'fresh' ? 'success' : source.cacheState === 'cached' ? 'warning' : 'critical';
  const healthTone = source.health === 'healthy' || (!source.health && source.cacheState === 'fresh') ? 'success' : source.health === 'offline' || source.cacheState === 'offline' ? 'critical' : 'warning';
  const modeLabel = source.mode === 'api' ? 'API' : source.mode === 'mock' ? 'Fallback' : source.mode.toUpperCase();
  return (
    <div className="data-meta">
      <span className="data-meta__item data-meta__item--source"><Database size={13} /><span><small>{t('meta.source')}</small><strong>{source.provider}</strong></span></span>
      <span className="data-meta__item"><Clock3 size={13} /><span><small>{t('meta.updated')}</small><strong>{formatDateTime(source.updatedAt)}</strong></span></span>
      <span className="data-meta__item"><Activity size={13} /><span><small>连接</small><strong><span className={`data-meta__status data-meta__status--${healthTone}`}>{source.health ?? (source.cacheState === 'fresh' ? 'healthy' : 'degraded')}</span></strong></span></span>
      <span className="data-meta__item"><Gauge size={13} /><span><small>{t('meta.cache')} / 模式</small><strong><span className={`data-meta__status data-meta__status--${cacheTone}`}>{source.cacheState} · {modeLabel}</span></strong></span></span>
      {source.latencyMs != null ? <span className="data-meta__item"><span><small>延迟</small><strong>{source.latencyMs} ms</strong></span></span> : null}
      {source.lineage ? <span className="data-meta__item data-meta__item--lineage"><GitBranch size={13} /><span><small>数据血缘</small><strong>{source.lineage}</strong></span></span> : null}
    </div>
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
  title = '加载失败',
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

export function LoadingState({ label = '加载中' }: { label?: string }) {
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
