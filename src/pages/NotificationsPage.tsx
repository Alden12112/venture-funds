import { useEffect, useMemo, useState } from 'react';
import { MailOpen, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNotificationBundle } from '@/adapters/notification-adapter';
import { formatDateTime } from '@/lib/format';
import type { NotificationItem } from '@/types';
import { writeStorage } from '@/lib/storage';

const categories = ['全部', 'system', 'market', 'task', 'fund'] as const;

export function NotificationsPage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const bundle = useAsyncResource(() => loadNotificationBundle(), [refreshKey]);
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (bundle.status !== 'success') return;
    setItems(bundle.data.items);
  }, [bundle.status]);

  if (bundle.status === 'loading') {
    return <LoadingState label="正在载入通知" />;
  }

  if (bundle.status === 'error') {
    return <div className="state-block state-block--error"><strong>通知中心暂时不可用</strong><p>{bundle.error}</p></div>;
  }

  const filtered = useMemo(() => {
    return items.filter((item) => category === '全部' || item.category === category);
  }, [category, items]);

  const unread = filtered.filter((item) => !item.read).length;

  const markAll = () => {
    setItems((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      writeStorage('notificationReads', Object.fromEntries(next.map((item) => [item.id, true])));
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
            <button type="button" className="btn btn--ghost" onClick={() => setRefreshKey((value) => value + 1)}>
              <RefreshCw size={16} />
              刷新
            </button>
          </>
        }
      />

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
              {item}
            </button>
          ))}
        </div>
      </section>

      {filtered.length ? (
        <section className="news-list">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notification-item ${item.read ? '' : 'is-unread'}`}
              onClick={() => {
                toggleRead(item.id);
                navigate(targetFor(item));
              }}
            >
              <div className="notification-item__head">
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
                <StatusPill tone={item.read ? 'muted' : 'warning'}>{item.read ? '已读' : '未读'}</StatusPill>
              </div>
              <div className="news-item__meta">
                <span>{item.category}</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
            </button>
          ))}
        </section>
      ) : (
        <EmptyState title="没有匹配通知" text="切换到其他分类，或者清空筛选条件。" />
      )}
    </div>
  );
}
