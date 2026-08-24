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

const categories = ['All', 'system', 'market', 'task', 'fund'] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
  All: 'All alerts',
  system: 'System',
  market: 'Market',
  task: 'Task',
  fund: 'Funding',
};

function NotificationIcon({ category, level }: Pick<NotificationItem, 'category' | 'level'>) {
  if (level === 'critical') return <AlertTriangle size={18} />;
  if (category === 'market') return <TrendingUp size={18} />;
  if (category === 'fund') return <CircleDollarSign size={18} />;
  if (category === 'task') return <CheckCheck size={18} />;
  return <Settings2 size={18} />;
}

export function NotificationsPage() {
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
    return <LoadingState label="Loading workspace alerts" />;
  }

  if (bundle.status === 'error') {
    return <div className="state-block state-block--error"><strong>Workspace alerts are temporarily unavailable</strong><p>{bundle.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNotifications}><RefreshCw size={15} /> Reconnect alerts</button></div>;
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
        eyebrow="WORKSPACE SIGNALS"
        title="Alerts Center"
        description="System, market, task and funding alerts with clear unread state and direct next actions."
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={markAll}>
              <MailOpen size={16} />
              Mark all read
            </button>
            <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNotifications} disabled={refreshing}>
              <RefreshCw size={16} />
              {refreshing ? 'Synchronizing…' : 'Refresh'}
            </button>
          </>
        }
      />

      <section className="notification-overview">
        <div className="notification-overview__icon"><BellRing size={20} /></div>
        <div>
          <strong>{unread ? `${unread} alerts need review` : 'All alerts are handled'}</strong>
          <p>Selecting an alert updates its read state; use the linked action only when you want to leave this page.</p>
        </div>
        <StatusPill tone={unread ? 'warning' : 'success'}>{unread ? 'Review needed' : 'All clear'}</StatusPill>
      </section>

      <section className="metric-grid metric-grid--compact">
        <StatCard label="Unread now" value={String(unread)} note="Filtered view" />
        <StatCard label="Total alerts" value={String(filtered.length)} note="Current selection" />
        <StatCard label="System signals" value={String(items.filter((item) => item.category === 'system').length)} />
        <StatCard label="Funding signals" value={String(items.filter((item) => item.category === 'fund').length)} />
      </section>

      <section className="panel panel--controls">
        <div className="chip-row">
          {categories.map((item) => (
            <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>
              {categoryLabels[item]}
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
                    <span className="eyebrow">{categoryLabels[item.category]}</span>
                    <h2>{item.title}</h2>
                  </div>
                </div>
                <div className="notification-item__controls">
                  <StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? 'Read' : 'Unread'}</StatusPill>
                  <button type="button" className="icon-button icon-button--small" onClick={() => toggleRead(item.id)} aria-label={item.read ? 'Mark as unread' : 'Mark as read'}>
                    {item.read ? <MailOpen size={15} /> : <CheckCheck size={15} />}
                  </button>
                </div>
              </div>
              <p className="notification-item__body">{item.body}</p>
              <div className="notification-item__footer">
                <div className="news-item__meta">
                  <span>{categoryLabels[item.category]}</span>
                  <span>{formatDateTime(item.createdAt)}</span>
                </div>
                <Link className="link-action link-action--inline notification-item__open" to={targetFor(item)} onClick={() => markRead(item.id)}>
                  Open related workspace <ExternalLink size={13} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="No matching alerts" text="Switch category or clear the current filtering choice." />
      )}
    </div>
  );
}
