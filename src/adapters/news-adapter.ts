import type { NewsBundle, NewsItem } from '@/types';

interface YahooNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
}

interface YahooFinanceSearchResponse {
  news?: YahooNewsItem[];
  ad88Fallback?: boolean;
  ad88Source?: string;
}

function inferMarkets(item: YahooNewsItem) {
  const text = `${item.title} ${item.publisher}`.toLowerCase();
  const markets: string[] = [];
  if (text.includes('bitcoin') || text.includes('crypto') || text.includes('ethereum')) markets.push('Crypto');
  if (text.includes('gold') || text.includes('silver') || text.includes('metal')) markets.push('Metals');
  if (text.includes('oil') || text.includes('energy') || text.includes('natural gas')) markets.push('Energy');
  if (text.includes('forex') || text.includes('dollar') || text.includes('euro') || text.includes('yen')) markets.push('FX');
  if (text.includes('stock') || text.includes('equity') || text.includes('index') || text.includes('earnings')) markets.push('Equities');
  return markets.length ? markets : ['Global markets'];
}

function inferCountry(item: YahooNewsItem) {
  const text = `${item.title} ${item.publisher}`.toLowerCase();
  if (text.includes('china') || text.includes('beijing')) return 'China';
  if (text.includes('europe') || text.includes('ecb') || text.includes('germany')) return 'European Union';
  if (text.includes('uk') || text.includes('britain') || text.includes('boe')) return 'United Kingdom';
  if (text.includes('japan') || text.includes('yen') || text.includes('boj')) return 'Japan';
  return 'United States';
}

function inferImpact(item: YahooNewsItem): NewsItem['impact'] {
  const text = item.title.toLowerCase();
  if (text.includes('fed') || text.includes('rate') || text.includes('cpi') || text.includes('war') || text.includes('ban')) return 'high';
  if (text.includes('earnings') || text.includes('oil') || text.includes('gold') || text.includes('regulat')) return 'medium';
  return 'low';
}

function inferCategory(item: YahooNewsItem) {
  const text = `${item.title} ${item.publisher}`.toLowerCase();
  if (text.includes('regulat') || text.includes('sec') || text.includes('policy')) return 'Policy';
  if (text.includes('bitcoin') || text.includes('ethereum') || text.includes('crypto')) return 'Crypto';
  if (text.includes('fed') || text.includes('inflation') || text.includes('rate')) return 'Macro';
  if (text.includes('oil') || text.includes('energy') || text.includes('gas')) return 'Energy';
  if (text.includes('gold') || text.includes('silver') || text.includes('copper')) return 'Metals';
  if (text.includes('forex') || text.includes('dollar') || text.includes('euro') || text.includes('yen')) return 'FX';
  return 'Markets';
}

function inferTone(item: YahooNewsItem): NewsItem['tone'] {
  const text = item.title.toLowerCase();
  if (text.includes('fall') || text.includes('risk') || text.includes('ban') || text.includes('probe')) return 'alert';
  if (text.includes('rise') || text.includes('gain') || text.includes('approve') || text.includes('launch')) return 'positive';
  return 'neutral';
}

function upcomingEvents() {
  const now = Date.now();
  const events = [
    ['US CPI release', 'Macro / FX / Gold', 'United States', 'USD', 1, 'Inflation data can reshape rate expectations, the US dollar and gold direction.', 'high', '3.0%', '2.9%'],
    ['EIA crude oil inventories', 'Crude Oil / Natural Gas', 'United States', 'USD', 2, 'Inventory changes commonly move energy curves and inflation trades.', 'medium', '-4.2M', '-2.1M'],
    ['ECB policy remarks', 'EUR / USD', 'European Union', 'EUR', 3, 'European rate language can shift relative EUR and USD strength.', 'high', 'Hold', 'Hold'],
    ['China manufacturing PMI', 'Copper / Southern Copper', 'China', 'CNY', 4, 'Manufacturing momentum is a leading signal for industrial-metal demand.', 'medium', '49.7', '50.1'],
    ['US employment report', 'Equities / FX / Gold', 'United States', 'USD', 6, 'Employment data is a core weekly event for risk assets and rate markets.', 'high', '177K', '185K'],
  ] as const;
  return events.map(([title, market, country, currency, days, description, impact, previous, forecast], index) => ({
    id: `calendar-${index + 1}`,
    title,
    market,
    country,
    currency,
    scheduledAt: new Date(now + days * 86_400_000).toISOString(),
    description,
    impact,
    previous,
    forecast,
    actual: undefined,
    status: 'scheduled' as const,
  }));
}

export async function loadNewsBundle(): Promise<NewsBundle> {
  const endpoint = '/api/news?query=bitcoin%20crypto%20markets%20macro';
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) {
    throw new Error(`AD88 news API ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as YahooFinanceSearchResponse;
  const rows = data.news ?? [];
  const items: NewsItem[] = rows.map((item) => ({
    id: item.uuid,
    title: item.title,
    category: inferCategory(item),
    source: item.publisher,
    publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
    summary: `Live indexed market article from ${item.publisher}.`,
    tone: inferTone(item),
    markets: inferMarkets(item),
    country: inferCountry(item),
    impact: inferImpact(item),
    targetPath: inferMarkets(item).includes('Energy') ? '/app/market' : inferMarkets(item).includes('Crypto') ? '/app/market' : '/app/news',
    url: item.link,
  }));

  return {
    items,
    categories: ['All', 'Markets', 'Macro', 'Policy', 'Crypto', 'Energy', 'Metals', 'FX'],
    events: upcomingEvents(),
    source: {
      provider: data.ad88Source ? `AD88 news proxy → ${data.ad88Source}` : 'AD88 local news API proxy',
      mode: data.ad88Fallback ? 'mock' : 'api',
      updatedAt: new Date().toISOString(),
      cacheState: data.ad88Fallback ? 'stale' : 'fresh',
      endpoint,
    },
  };
}
