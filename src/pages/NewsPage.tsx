import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Filter, Globe2, RefreshCcw, Search, Target } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataMeta, EmptyState, LoadingState, StatusPill } from '@/components/Stats';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadNewsBundle } from '@/adapters/news-adapter';
import { formatDateTime } from '@/lib/format';
import { newsCategories } from '@/data/navigation';

const sentimentFilters = ['All sentiment', 'positive', 'neutral', 'alert'] as const;

export function NewsPage() {
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

  if (news.status === 'loading') return <LoadingState label="Building your research briefing" />;
  if (news.status === 'error') return <div className="state-block state-block--error"><strong>Research feed is temporarily unavailable</strong><p>{news.error}</p><button type="button" className="btn btn--ghost" onClick={refreshNews}><RefreshCcw size={15} /> Reconnect research</button></div>;

  const highImpact = filtered.filter((item) => item.impact === 'high').length;
  const upcoming = news.data.events.slice(0, 5);

  return (
    <div className="page-stack research-page">
      <PageHeader eyebrow="AD88 RESEARCH" title="Research & Intelligence" description="Market-moving context, country signals and event risk organized for decision-ready scanning." actions={<button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshNews} disabled={refreshing}><RefreshCcw size={16} /> {refreshing ? 'Synchronizing…' : 'Refresh briefing'}</button>} />

      <section className="research-hero-band">
        <div><span className="eyebrow">INSTITUTIONAL CONTEXT</span><h2>What may move the next session.</h2><p>Each brief carries an impact rating, relevant market set and country context so the research feed becomes operational rather than passive.</p></div>
        <div className="research-hero-band__stats"><div><span>Current briefs</span><strong>{filtered.length}</strong></div><div><span>High-impact</span><strong>{highImpact}</strong></div><div><span>Forward calendar</span><strong>{upcoming.length}</strong></div></div>
      </section>

      <DataMeta source={{ ...news.data.source, dataState: news.data.source.cacheState === 'stale' ? 'fallback' : 'live' }} />

      <section className="panel panel--controls research-controls">
        <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search headlines, themes or market context" /></label>
        <div className="chip-row" aria-label="Research category">{newsCategories.map((item) => <button key={item} type="button" className={`chip ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="chip-row" aria-label="Research sentiment">{sentimentFilters.map((item) => <button key={item} type="button" className={`chip ${tone === item ? 'is-active' : ''}`} onClick={() => setTone(item)}><Filter size={14} /> {item}</button>)}</div>
        <div className="chip-row news-window-row"><span className="filter-caption">History window</span>{[7, 30].map((days) => <button key={days} type="button" className={`chip ${windowDays === days ? 'is-active' : ''}`} onClick={() => setWindowDays(days as 7 | 30)}>Last {days} days</button>)}</div>
      </section>

      <section className="research-layout">
        <div className="news-list">
          {filtered.length ? filtered.map((item) => <article key={item.id} className="news-item news-item--research"><div className="news-item__head"><div><span className="eyebrow">{item.category}</span><h2>{item.title}</h2></div><StatusPill tone={item.tone === 'positive' ? 'success' : item.tone === 'alert' ? 'critical' : 'info'}>{item.tone}</StatusPill></div><p>{item.summary}</p><div className="news-impact-row"><span className="news-tag"><Target size={13} /> Markets: {item.markets.join(' · ')}</span><span className="news-tag"><Globe2 size={13} /> {item.country}</span><StatusPill tone={item.impact === 'high' ? 'critical' : item.impact === 'medium' ? 'warning' : 'info'}>{item.impact} impact</StatusPill></div><div className="news-item__meta"><span>Briefed {formatDateTime(item.publishedAt)}</span>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="link-action link-action--inline">Open analysis</a> : null}</div></article>) : <EmptyState title="No matching research" text="Adjust the market, sentiment or search filters to widen the briefing." />}
        </div>

        <aside className="research-calendar panel">
          <div className="panel__head"><div><h2><CalendarClock size={18} /> Event risk calendar</h2><p>Forward-looking macro and sector events are kept within the next seven days.</p></div><StatusPill tone="info">7-day horizon</StatusPill></div>
          <div className="research-calendar__list">{upcoming.map((event) => <article key={event.id} className="calendar-event"><div className="calendar-event__date">{formatDateTime(event.scheduledAt)}</div><strong>{event.title}</strong><span>{event.market} · {event.country}</span><p>{event.description}</p><StatusPill tone={event.impact === 'high' ? 'critical' : event.impact === 'medium' ? 'warning' : 'info'}>{event.impact} impact</StatusPill></article>)}</div>
        </aside>
      </section>
    </div>
  );
}
