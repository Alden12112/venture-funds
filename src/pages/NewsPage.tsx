import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Filter, Globe2, Search, RefreshCcw, Target } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatDateTime } from '@/lib/format';
import { newsCategories } from '@/data/navigation';

export function NewsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'全部' | (typeof newsCategories)[number]>('全部');
  const [tone, setTone] = useState<'全部' | 'positive' | 'neutral' | 'alert'>('全部');
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const news = useAsyncResource(() => loadNewsBundle(), [refreshKey]);

  const refreshNews = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (news.status === 'success') setRefreshing(false);
  }, [news.status, news.status === 'success' ? news.data.source.updatedAt : '']);

  const filtered = useMemo(() => {
    if (news.status !== 'success') return [];
    return news.data.items.filter((item) => {
      const matchesCategory = category === '全部' || item.category === category;
      const matchesTone = tone === '全部' || item.tone === tone;
      const matchesWindow = new Date(item.publishedAt).getTime() >= Date.now() - windowDays * 86_400_000;
      const matchesQuery =
        !query ||
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.summary.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesTone && matchesQuery && matchesWindow;
    });
  }, [category, news, query, tone, windowDays]);

  if (news.status === 'loading') {
    return <LoadingState label="正在整理新闻流" />;
  }

  if (news.status === 'error') {
    return <div className="state-block state-block--error"><strong>新闻暂时无法加载</strong><p>{news.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNews}><RefreshCcw size={15} />重新连接新闻源</button></div>;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="资讯"
        title="新闻"
        description="新闻列表、分类和搜索都走同一套适配层。"
        meta={<DataMeta source={news.data.source} />}
        actions={
          <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNews} disabled={refreshing}>
            <RefreshCcw size={16} />
            {refreshing ? '正在同步…' : '刷新'}
          </button>
        }
      />

      <section className="panel panel--controls">
        <label className="search-field">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或摘要" />
        </label>
        <div className="chip-row">
          {newsCategories.map((item) => (
            <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {(['全部', 'positive', 'neutral', 'alert'] as const).map((item) => (
            <button key={item} type="button" className={`chip ${tone === item ? 'is-active' : ''}`} onClick={() => setTone(item)}>
              <Filter size={14} />
              {item === '全部' ? '全部情绪' : item}
            </button>
          ))}
        </div>
        <div className="chip-row news-window-row">
          <span className="filter-caption">历史窗口</span>
          {[7, 30].map((days) => (
            <button key={days} type="button" className={`chip ${windowDays === days ? 'is-active' : ''}`} onClick={() => setWindowDays(days as 7 | 30)}>
              近 {days} 天
            </button>
          ))}
        </div>
      </section>

      {filtered.length ? (
        <section className="news-list">
          {filtered.map((item) => (
            <article key={item.id} className="news-item">
              <div className="news-item__head">
                <div>
                  <span className="eyebrow">{item.category}</span>
                  <h2>{item.title}</h2>
                </div>
                <StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>
                  {item.tone}
                </StatusPill>
              </div>
              <p>{item.summary}</p>
              <div className="news-impact-row">
                <span className="news-tag"><Target size={13} />影响 {item.markets.join(' · ')}</span>
                <span className="news-tag"><Globe2 size={13} />发布地 {item.country}</span>
                <StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{item.impact} impact</StatusPill>
              </div>
              <div className="news-item__meta">
                <span>来源 {item.source}</span>
                <span>{formatDateTime(item.publishedAt)}</span>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="link-action link-action--inline">查看原文</a> : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="没有匹配的新闻" text="换个关键词或分类，新闻流会重新收敛。" />
      )}

      <section className="panel news-calendar">
        <div className="panel__head">
          <div>
            <h2><CalendarClock size={18} />未来 7 天市场日历</h2>
            <p>宏观、能源和工业金属事件会提前进入工作台。</p>
          </div>
          <StatusPill tone="info">最多提前 7 天</StatusPill>
        </div>
        <div className="news-calendar__grid">
          {news.data.events.map((event) => (
            <article key={event.id} className="calendar-event">
              <div className="calendar-event__date">{formatDateTime(event.scheduledAt)}</div>
              <strong>{event.title}</strong>
              <span>{event.market} · {event.country}</span>
              <p>{event.description}</p>
              <StatusPill tone={event.impact === 'high' ? 'critical' : event.impact === 'medium' ? 'warning' : 'info'}>{event.impact} impact</StatusPill>
            </article>
          ))}
        </div>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>来源说明</h2>
              <p>RSS / API 聚合的替换入口预留在适配层。</p>
            </div>
          </div>
          <div className="stack-list">
            {news.data.categories.map((item) => (
              <div key={item} className="stack-list__row">
                <div>
                  <strong>{item}</strong>
                  <span>可作为独立分类或标签源</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>阅读状态</h2>
              <p>筛选后的列表会保留已读与未读语义。</p>
            </div>
          </div>
          <div className="mini-grid">
            <div className="stat-card">
              <span className="stat-card__label">当前结果</span>
              <strong className="stat-card__value">{filtered.length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">筛选</span>
              <strong className="stat-card__value">{category}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">情绪</span>
              <strong className="stat-card__value">{tone}</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
