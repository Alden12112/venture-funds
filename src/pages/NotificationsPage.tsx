import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCheck, CircleDollarSign, ExternalLink, MailOpen, RefreshCw, Settings2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatDateTime } from '@/lib/format';
import type { NotificationItem } from '@/types';
import { writeStorage } from '@/lib/storage';
import { useLanguage } from '@/context/language-context';

const categories = ['All', 'system', 'market', 'task', 'fund'] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
  All: 'ui.all',
  system: 'ui.system',
  market: 'ui.market',
  task: 'ui.task',
  fund: 'ui.funding',
};

function NotificationIcon({ category, level }: Pick<NotificationItem, 'category' | 'level'>) {
  if (level === 'critical') return <AlertTriangle size={18} />;
  if (category === 'market') return <TrendingUp size={18} />;
  if (category === 'fund') return <CircleDollarSign size={18} />;
  if (category === 'task') return <CheckCheck size={18} />;
  return <Settings2 size={18} />;
}

export function NotificationsPage() {
  const { t } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const bundle = useAsyncResource(() => loadNotificationBundle(), [refreshKey]);
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (bundle.status !== 'success') return;
    setItems(bundle.data.items);
    setRefreshing(false);
  }, [bundle.status]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (key === 'notificationReads') setRefreshKey((value) => value + 1);
    };
    window.addEventListener('ad88:storage-sync', refresh);
    return () => window.removeEventListener('ad88:storage-sync', refresh);
  }, []);

  const refreshNotifications = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  const filtered = useMemo(() => {
    return items.filter((item) => category === 'All' || item.category === category);
  }, [category, items]);

  const unread = filtered.filter((item) => !item.read).length;

  if (bundle.status === 'loading') {
    return <LoadingState label={t('alerts.loading')} />;
  }

  if (bundle.status === 'error') {
    return <div className="state-block state-block--error"><strong>{t('alerts.unavailable')}</strong><p>{bundle.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNotifications}><RefreshCw size={15} /> {t('alerts.reconnect')}</button></div>;
  }

  const markAll = () => {
    setItems((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      writeStorage('notificationReads', Object.fromEntries(next.map((item) => [item.id, true])));
      return next;
    });
  };

  const markRead = (id: string) => {
    setItems((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, read: true } : item));
      writeStorage('notificationReads', Object.fromEntries(next.map((item) => [item.id, item.read])));
      return next;
    });
  };

  const toggleRead = (id: string) => {
    setItems((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, read: !item.read } : item));
      writeStorage('notificationReads', Object.fromEntries(next.map((item) => [item.id, item.read])));
      return next;
    });
  };

  const targetFor = (item: NotificationItem) => {
    if (item.targetPath) return item.targetPath;
    if (item.category === 'market') return '/app/market';
    if (item.category === 'fund') return '/app/ledger';
    if (item.category === 'task') return '/app/news';
    return '/app/settings';
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('alerts.eyebrow')}
        title={t('alerts.title')}
        description={t('alerts.description')}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={markAll}>
              <MailOpen size={16} />
              {t('alerts.markAll')}
            </button>
            <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNotifications} disabled={refreshing}>
              <RefreshCw size={16} />
              {refreshing ? t('news.syncing') : t('alerts.refresh')}
            </button>
          </>
        }
      />

      <section className="notification-overview">
        <div className="notification-overview__icon"><BellRing size={20} /></div>
        <div>
          <strong>{unread ? `${unread}${t('alerts.needReview')}` : t('alerts.handled')}</strong>
          <p>{t('alerts.overviewHint')}</p>
        </div>
        <StatusPill tone={unread ? 'warning' : 'success'}>{unread ? t('ui.reviewNeeded') : t('ui.allClear')}</StatusPill>
      </section>

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('alerts.unreadNow')} value={String(unread)} note={t('alerts.filteredView')} />
        <StatCard label={t('alerts.total')} value={String(filtered.length)} note={t('alerts.currentSelection')} />
        <StatCard label={t('alerts.systemSignals')} value={String(items.filter((item) => item.category === 'system').length)} />
        <StatCard label={t('alerts.fundingSignals')} value={String(items.filter((item) => item.category === 'fund').length)} />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {categories.map((item) => (
            <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>
              {t(categoryLabels[item])}
            </button>
          ))}
        </div>
      </section>

      {filtered.length ? (
        <section className="news-list">
          {filtered.map((item) => (
            <article
              key={item.id}
              className={`notification-item ${item.read ? '' : 'is-unread'}`}
            >
              <div className="notification-item__head">
                <div className="notification-item__title">
                  <span className={`notification-item__icon notification-item__icon--${item.level}`}><NotificationIcon category={item.category} level={item.level} /></span>
                  <div>
              <span className="eyebrow">{t(categoryLabels[item.category])}</span>
                    <h2>{item.title}</h2>
                  </div>
                </div>
                <div className="notification-item__controls">
                  <StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? t('ui.read') : t('ui.unread')}</StatusPill>
                  <button type="button" className="icon-button icon-button--small" onClick={() => toggleRead(item.id)} aria-label={item.read ? t('alerts.markUnread') : t('alerts.markRead')}>
                    {item.read ? <MailOpen size={15} /> : <CheckCheck size={15} />}
                  </button>
                </div>
              </div>
              <p className="notification-item__body">{item.body}</p>
              <div className="notification-item__footer">
                <div className="news-item__meta">
                  <span>{t(categoryLabels[item.category])}</span>
                  <span>{formatDateTime(item.createdAt)}</span>
                </div>
                <Link className="link-action link-action--inline notification-item__open" to={targetFor(item)} onClick={() => markRead(item.id)}>
                  {t('alerts.openRelated')} <ExternalLink size={13} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title={t('alerts.noMatches')} text={t('alerts.noMatchesHint')} />
      )}
    </div>
  );
}
