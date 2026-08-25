import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Filter, Globe2, RefreshCcw, Search, Target } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatDateTime } from '@/lib/format';
import { newsCategories } from '@/data/navigation';
import { useLanguage } from '@/context/language-context';
import { labelCalendarDescription, labelCalendarTitle, labelCountry, labelMarket, labelNewsCategory, labelNewsImpact, labelNewsSentiment, labelNewsSummary } from '@/lib/news-labels';

const sentimentFilters = ['All sentiment', 'positive', 'neutral', 'alert'] as const;

const categoryKey: Record<(typeof newsCategories)[number], Parameters<typeof String>[0] | string> = {
  All: 'news.categoryAll',
  Markets: 'news.categoryMarkets',
  Macro: 'news.categoryMacro',
  Policy: 'news.categoryPolicy',
  Crypto: 'news.categoryCrypto',
  Energy: 'news.categoryEnergy',
  Metals: 'news.categoryMetals',
  FX: 'news.categoryFX',
};

const sentimentKey: Record<(typeof sentimentFilters)[number], string> = {
  'All sentiment': 'news.allSentiment',
  positive: 'news.positive',
  neutral: 'news.neutral',
  alert: 'news.alert',
};

export function NewsPage() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof newsCategories)[number]>('All');
  const [tone, setTone] = useState<(typeof sentimentFilters)[number]>('All sentiment');
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
      const matchesCategory = category === 'All' || item.category === category;
      const matchesTone = tone === 'All sentiment' || item.tone === tone;
      const matchesWindow = new Date(item.publishedAt).getTime() >= Date.now() - windowDays * 86_400_000;
      const matchesQuery = !query || item.title.toLowerCase().includes(query.toLowerCase()) || item.summary.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesTone && matchesQuery && matchesWindow;
    });
  }, [category, news, query, tone, windowDays]);

  if (news.status === 'loading') return <LoadingState label={t('news.loading')} />;
  if (news.status === 'error') return <div className="state-block state-block--error"><strong>{t('news.unavailable')}</strong><p>{news.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNews}><RefreshCcw size={15} /> {t('news.reconnect')}</button></div>;

  const highImpact = filtered.filter((item) => item.impact === 'high').length;
  const upcoming = news.data.events.slice(0, 5);
  const labelCategory = (value: string) => labelNewsCategory(value, t);
  const labelTone = (value: string) => labelNewsSentiment(value, t);
  const labelImpact = (value: string) => labelNewsImpact(value, t);

  return (
    <div className="page-stack research-page">
      <PageHeader eyebrow={t('news.eyebrow')} title={t('news.title')} description={t('news.description')} actions={<button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNews} disabled={refreshing}><RefreshCcw size={16} /> {refreshing ? t('news.syncing') : t('news.refresh')}</button>} />

      <section className="research-hero-band">
         <div><span className="eyebrow">{t('news.heroEyebrow')}</span><h2>{t('news.heroTitle')}</h2><p>{t('news.heroText')}</p></div>
         <div className="research-hero-band__stats"><div><span>{t('news.currentBriefs')}</span><strong>{filtered.length}</strong></div><div><span>{t('news.highImpact')}</span><strong>{highImpact}</strong></div><div><span>{t('news.forwardCalendar')}</span><strong>{upcoming.length}</strong></div></div>
      </section>

      <DataMeta source={{ ...news.data.source, dataState: news.data.source.cacheState === 'stale' ? 'fallback' : 'live' }} />

      <section className="panel panel--controls research-controls">
         <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('news.searchPlaceholder')} /></label>
         <div className="chip-row" aria-label={t('news.categoryLabel')}>{newsCategories.map((item) => <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{t(categoryKey[item])}</button>)}</div>
         <div className="chip-row" aria-label={t('news.sentimentLabel')}>{sentimentFilters.map((item) => <button key={item} type="button" className={`chip ${tone === item ? 'is-active' : ''}`} onClick={() => setTone(item)}><Filter size={14} /> {t(sentimentKey[item])}</button>)}</div>
         <div className="chip-row news-window-row"><span className="filter-caption">{t('news.historyWindow')}</span>{[7, 30].map((days) => <button key={days} type="button" className={`chip ${windowDays === days ? 'is-active' : ''}`} onClick={() => setWindowDays(days as 7 | 30)}>{t('news.lastDays').replace('{days}', String(days))}</button>)}</div>
      </section>

      <section className="research-layout">
        <div className="news-list">
          {filtered.length ? filtered.map((item) => <article key={item.id} className="news-item news-item--research"><div className="news-item__head"><div><span className="eyebrow">{labelCategory(item.category)}</span><h2>{item.title}</h2></div><StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{labelTone(item.tone)}</StatusPill></div><p>{labelNewsSummary(item.source, t)}</p><div className="news-impact-row"><span className="news-tag"><Target size={13} /> {t('news.markets')}: {item.markets.map((market) => labelMarket(market, t)).join(' · ')}</span><span className="news-tag"><Globe2 size={13} /> {labelCountry(item.country, t)}</span><StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{labelImpact(item.impact)}</StatusPill></div><div className="news-item__meta"><span>{t('news.briefed')} {formatDateTime(item.publishedAt)}</span>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="link-action link-action--inline">{t('news.openAnalysis')}</a> : null}</div></article>) : <EmptyState title={t('news.noMatches')} text={t('news.noMatchesHint')} />}
        </div>

        <aside className="research-calendar panel">
           <div className="panel__head"><div><h2><CalendarClock size={18} /> {t('news.calendar')}</h2><p>{t('news.calendarHint')}</p></div><StatusPill tone="info">{t('news.horizon')}</StatusPill></div>
           <div className="research-calendar__list">{upcoming.map((event) => <article key={event.id} className="calendar-event"><div className="calendar-event__date">{formatDateTime(event.scheduledAt)}</div><strong>{labelCalendarTitle(event.title, t)}</strong><span>{labelMarket(event.market, t)} · {labelCountry(event.country, t)}</span><p>{labelCalendarDescription(event.description, t)}</p><StatusPill tone={event.impact === 'high' ? 'critical' : event.impact === 'medium' ? 'warning' : 'info'}>{labelImpact(event.impact)}</StatusPill></article>)}</div>
        </aside>
      </section>
    </div>
  );
}
