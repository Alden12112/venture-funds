import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCheck, CircleDollarSign, ExternalLink, MailOpen, RefreshCw, Settings2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatDateTime } from '@/lib/format';
import type { NotificationItem } from '@/types';
import { writeStorage } from '@/lib/storage';

const categories = ['全部', 'system', 'market', 'task', 'fund'] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
  全部: '全部消息',
  system: '系统',
  market: '行情',
  task: '任务',
  fund: '资金',
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
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
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
    return items.filter((item) => category === '全部' || item.category === category);
  }, [category, items]);

  const unread = filtered.filter((item) => !item.read).length;

  if (bundle.status === 'loading') {
    return <LoadingState label="正在载入通知" />;
  }

  if (bundle.status === 'error') {
    return <div className="state-block state-block--error"><strong>通知中心暂时不可用</strong><p>{bundle.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNotifications}><RefreshCw size={15} />重新连接通知源</button></div>;
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
        eyebrow="消息"
        title="通知中心"
        description="系统、行情、任务和资金通知统一管理已读与未读。"
        meta={<DataMeta source={bundle.data.source} />}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={markAll}>
              <MailOpen size={16} />
              全部已读
            </button>
            <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNotifications} disabled={refreshing}>
              <RefreshCw size={16} />
              {refreshing ? '正在同步…' : '刷新'}
            </button>
          </>
        }
      />

      <section className="notification-overview">
        <div className="notification-overview__icon"><BellRing size={20} /></div>
        <div>
          <strong>{unread ? `${unread} 条通知需要查看` : '通知已全部处理'}</strong>
          <p>点击卡片只会更新已读状态；使用“打开关联页面”才会离开通知中心。</p>
        </div>
        <StatusPill tone={unread ? 'warning' : 'success'}>{unread ? '需要关注' : '状态正常'}</StatusPill>
      </section>

      <section className="metric-grid metric-grid--compact">
        <StatCard label="当前未读" value={String(unread)} note="筛选后的统计" />
        <StatCard label="通知总数" value={String(filtered.length)} note="当前视图" />
        <StatCard label="系统层" value={String(items.filter((item) => item.category === 'system').length)} />
        <StatCard label="资金层" value={String(items.filter((item) => item.category === 'fund').length)} />
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
                  <StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? '已读' : '未读'}</StatusPill>
                  <button type="button" className="icon-button icon-button--small" onClick={() => toggleRead(item.id)} aria-label={item.read ? '标记为未读' : '标记为已读'}>
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
                  打开关联页面 <ExternalLink size={13} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="没有匹配通知" text="切换到其他分类，或者清空筛选条件。" />
      )}
    </div>
  );
}
