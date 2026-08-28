import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BarChart3, CalendarClock, Clock3, Filter, Globe2, RefreshCcw, Search, ShieldCheck, Target } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatDateTime } from '@/lib/format';
import { newsCategories } from '@/data/navigation';
import { useLanguage } from '@/context/language-context';
import { VentureCampaignRail } from '@/components/VentureCampaignRail';
import { labelCalendarDescription, labelCalendarTitle, labelCountry, labelMarket, labelNewsCategory, labelNewsImpact, labelNewsSentiment, labelNewsSummary } from '@/lib/news-labels';
import type { NewsEvent } from '@/types';
import { useContentSettings } from '@/context/content-settings-context';
import { MARKET_SCENARIO_DIALOG_SAFETY_KEY } from '@/lib/content-settings';

const sentimentFilters = ['All sentiment', 'positive', 'neutral', 'alert'] as const;

const categoryKey: Record<(typeof newsCategories)[number], string> = {
  All: 'news.categoryAll', Markets: 'news.categoryMarkets', Macro: 'news.categoryMacro', Policy: 'news.categoryPolicy',
  Crypto: 'news.categoryCrypto', Energy: 'news.categoryEnergy', Metals: 'news.categoryMetals', FX: 'news.categoryFX',
};

const sentimentKey: Record<(typeof sentimentFilters)[number], string> = {
  'All sentiment': 'news.allSentiment', positive: 'news.positive', neutral: 'news.neutral', alert: 'news.alert',
};

function eventCountdown(event: NewsEvent, now: number, t: (key: string) => string) {
  const delta = new Date(event.scheduledAt).getTime() - now;
  if (delta <= 0) return t('news.live');
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return t('news.inMinutes').replace('{value}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('news.inHours').replace('{value}', String(hours));
  return t('news.inDays').replace('{value}', String(Math.floor(hours / 24)));
}

function eventStatusLabel(event: NewsEvent, t: (key: string) => string) {
  if (event.status === 'live') return t('news.live');
  if (event.status === 'released') return t('news.released');
  return t('news.scheduled');
}

function eventImpactTone(impact: NewsEvent['impact']) {
  return impact === 'high' ? 'critical' : impact === 'medium' ? 'warning' : 'info';
}

export function NewsPage() {
  const { language, t } = useLanguage();
  const { getContent } = useContentSettings();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof newsCategories)[number]>('All');
  const [tone, setTone] = useState<(typeof sentimentFilters)[number]>('All sentiment');
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarNow, setCalendarNow] = useState(() => Date.now());
  const news = useAsyncResource(() => loadNewsBundle(), [refreshKey]);

  const refreshNews = () => { setRefreshing(true); setRefreshKey((value) => value + 1); };

  useEffect(() => {
    const timer = window.setInterval(() => setCalendarNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const upcoming = news.data.events.slice(0, 7);
  const nextEvent = upcoming[0];
  const labelCategory = (value: string) => labelNewsCategory(value, t);
  const labelTone = (value: string) => labelNewsSentiment(value, t);
  const labelImpact = (value: string) => labelNewsImpact(value, t);

  return (
    <div className="page-stack research-page">
      <PageHeader eyebrow={t('news.eyebrow')} title={t('news.title')} description={t('news.description')} actions={<button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNews} disabled={refreshing}><RefreshCcw size={16} /> {refreshing ? t('news.syncing') : t('news.refresh')}</button>} />

      <section className="research-hero-band">
        <div className="research-hero-band__copy"><span className="eyebrow">{t('news.heroEyebrow')}</span><h2>{t('news.heroTitle')}</h2><p>{t('news.heroText')}</p><div className="research-hero-band__rail"><span className="status-dot status-dot--live" /><span>{t('news.signalRail')}</span><strong>{t('news.signalRailValue')}</strong></div></div>
        <div className="research-hero-band__insight"><div className="research-hero-band__visual"><img src="/assets/market/research-signal.svg" alt="" loading="lazy" decoding="async" /><div><span>{t('news.visualEyebrow')}</span><strong>{t('news.visualTitle')}</strong></div></div><div className="research-hero-band__stats"><div><span>{t('news.currentBriefs')}</span><strong>{filtered.length}</strong></div><div><span>{t('news.highImpact')}</span><strong>{highImpact}</strong></div><div><span>{t('news.forwardCalendar')}</span><strong>{upcoming.length}</strong></div></div></div>
      </section>

      <DataMeta
        source={{ ...news.data.source, dataState: news.data.source.cacheState === 'stale' ? 'fallback' : 'live' }}
        refreshing={refreshing || news.refreshing}
        refreshError={news.refreshError}
      />

      <section className="panel research-calendar-workbench">
        <div className="panel__head research-calendar-workbench__head">
          <div><span className="eyebrow">{t('news.calendarWorkspaceEyebrow')}</span><h2><CalendarClock size={19} /> {t('news.calendarWorkspaceTitle')}</h2><p>{t('news.calendarWorkspaceHint')}</p></div>
          <div className="research-calendar-workbench__status"><StatusPill tone="info">{t('news.horizon')}</StatusPill><span><span className="status-dot status-dot--live" /> {t('news.calendarUpdated')} {formatDateTime(news.data.source.updatedAt)}</span></div>
        </div>
        <div className="research-calendar-kpis">
          <div><span>{t('news.nextEvent')}</span><strong>{nextEvent ? labelCalendarTitle(nextEvent.title, t) : '—'}</strong><small>{nextEvent ? eventCountdown(nextEvent, calendarNow, t) : '—'}</small></div>
          <div><span>{t('news.highImpact')}</span><strong>{upcoming.filter((event) => event.impact === 'high').length}</strong><small>{t('news.signalWindow')}</small></div>
          <div><span>{t('news.markets')}</span><strong>{new Set(upcoming.flatMap((event) => event.market.split(' / '))).size}</strong><small>{t('news.linkedMarkets')}</small></div>
        </div>
        <div className="table-wrap research-calendar-table-wrap" tabIndex={0}>
          <table className="table research-calendar-table">
            <thead><tr><th>{t('news.time')}</th><th>{t('news.event')}</th><th>{t('news.country')}</th><th>{t('news.markets')}</th><th>{t('news.previous')}</th><th>{t('news.forecast')}</th><th>{t('news.impact')}</th></tr></thead>
            <tbody>
              {upcoming.map((event) => <tr key={event.id}>
                <td><div className="calendar-event-time"><strong>{formatDateTime(event.scheduledAt)}</strong><span>{eventCountdown(event, calendarNow, t)}</span></div></td>
                <td><div className="calendar-event-name"><strong>{labelCalendarTitle(event.title, t)}</strong><span>{event.currency ?? '—'} · {eventStatusLabel(event, t)}</span></div></td>
                <td><span className="calendar-country"><span className="calendar-country__mark">{event.country.slice(0, 2).toUpperCase()}</span>{labelCountry(event.country, t)}</span></td>
                <td><span className="calendar-market-list">{labelMarket(event.market, t)}</span></td>
                <td className="calendar-value">{event.previous ?? '—'}</td>
                <td className="calendar-value">{event.forecast ?? '—'}</td>
                <td><StatusPill tone={eventImpactTone(event.impact)}>{labelImpact(event.impact)}</StatusPill></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel--controls research-controls">
        <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('news.searchPlaceholder')} /></label>
        <div className="chip-row" aria-label={t('news.categoryLabel')}>{newsCategories.map((item) => <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{t(categoryKey[item])}</button>)}</div>
        <div className="chip-row" aria-label={t('news.sentimentLabel')}>{sentimentFilters.map((item) => <button key={item} type="button" className={`chip ${tone === item ? 'is-active' : ''}`} onClick={() => setTone(item)}><Filter size={14} /> {t(sentimentKey[item])}</button>)}</div>
        <div className="chip-row news-window-row"><span className="filter-caption">{t('news.historyWindow')}</span>{[7, 30].map((days) => <button key={days} type="button" className={`chip ${windowDays === days ? 'is-active' : ''}`} onClick={() => setWindowDays(days as 7 | 30)}>{t('news.lastDays').replace('{days}', String(days))}</button>)}</div>
      </section>

      <section className="research-layout">
        <div className="news-list">
          {filtered.length ? filtered.map((item) => <article key={item.id} className="news-item news-item--research"><div className="news-item__head"><div><span className="eyebrow">{labelCategory(item.category)}</span><h2>{item.title}</h2></div><StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{labelTone(item.tone)}</StatusPill></div><p>{labelNewsSummary(item.source, t)}</p><div className="news-impact-row"><span className="news-tag"><Target size={13} /> {t('news.markets')}: {item.markets.map((market) => labelMarket(market, t)).join(' · ')}</span><span className="news-tag"><Globe2 size={13} /> {labelCountry(item.country, t)}</span><StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{labelImpact(item.impact)}</StatusPill></div><div className="news-item__meta"><span>{t('news.briefed')} {formatDateTime(item.publishedAt)}</span>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="link-action link-action--inline">{t('news.openAnalysis')} <ArrowUpRight size={14} /></a> : null}</div></article>) : <EmptyState title={t('news.noMatches')} text={t('news.noMatchesHint')} />}
        </div>

        <aside className="research-side-rail">
          <VentureCampaignRail compact />
          <section className="panel research-reading-room">
            <div className="panel__head"><div><h2><BarChart3 size={18} /> {t('news.readingRoom')}</h2><p>{t('news.readingRoomHint')}</p></div><Clock3 size={17} /></div>
            <div className="research-reading-room__rows"><div><span>{t('news.highImpact')}</span><strong>{highImpact}</strong></div><div><span>{t('news.linkedMarkets')}</span><strong>{new Set(filtered.flatMap((item) => item.markets)).size}</strong></div><div><span>{t('news.dataWindow')}</span><strong>{windowDays}d</strong></div></div>
          </section>
          <section className="panel research-calendar-mini">
            <div className="panel__head"><div><h2>{t('news.calendar')}</h2><p>{t('news.calendarHint')}</p></div><CalendarClock size={17} /></div>
            <div className="research-calendar__list">{upcoming.slice(0, 4).map((event) => <article key={event.id} className="calendar-event"><div className="calendar-event__date">{formatDateTime(event.scheduledAt)} · {eventCountdown(event, calendarNow, t)}</div><strong>{labelCalendarTitle(event.title, t)}</strong><span>{labelMarket(event.market, t)} · {labelCountry(event.country, t)}</span><p>{labelCalendarDescription(event.description, t)}</p><StatusPill tone={eventImpactTone(event.impact)}>{labelImpact(event.impact)}</StatusPill></article>)}</div>
          </section>
        </aside>
      </section>

      <div className="news-observation-disclosure" role="note">
        <ShieldCheck size={12} aria-hidden="true" />
        <span className="news-observation-disclosure__context">{t('news.observationContext')}</span>
        <span>{getContent(MARKET_SCENARIO_DIALOG_SAFETY_KEY, language)}</span>
      </div>
    </div>
  );
}
