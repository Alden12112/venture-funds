import type { ReactNode } from 'react';
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
  return (
    <div className="data-meta">
      <span>{t('meta.source')} {source.provider}</span>
      <span>{t('meta.updated')} {formatDateTime(source.updatedAt)}</span>
      <span>{t('meta.cache')} {source.cacheState}</span>
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
