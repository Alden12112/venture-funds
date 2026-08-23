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
  if (text.includes('regulat') || text.includes('sec') || text.includes('policy')) return '监管';
  if (text.includes('bitcoin') || text.includes('ethereum') || text.includes('crypto')) return '加密市场';
  if (text.includes('fed') || text.includes('inflation') || text.includes('rate')) return '宏观';
  if (text.includes('oil') || text.includes('energy') || text.includes('gas')) return '能源';
  if (text.includes('gold') || text.includes('silver') || text.includes('copper')) return '金属';
  if (text.includes('forex') || text.includes('dollar') || text.includes('euro') || text.includes('yen')) return '外汇';
  return '市场';
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
    ['US CPI release', 'Macro / FX / Gold', 'United States', 1, '通胀数据可能改变利率预期与美元、黄金方向。', 'high'],
    ['EIA crude oil inventories', 'Crude Oil / Natural Gas', 'United States', 2, '库存变化通常影响能源曲线与通胀交易。', 'medium'],
    ['ECB policy remarks', 'EUR / USD', 'European Union', 3, '欧洲利率措辞会影响欧元与美元相对强弱。', 'high'],
    ['China manufacturing PMI', 'Copper / Southern Copper', 'China', 4, '制造业景气度是工业金属需求的重要领先指标。', 'medium'],
    ['US employment report', 'Equities / FX / Gold', 'United States', 6, '就业数据是风险资产和利率市场的核心周度事件。', 'high'],
  ] as const;
  return events.map(([title, market, country, days, description, impact], index) => ({
    id: `calendar-${index + 1}`,
    title,
    market,
    country,
    scheduledAt: new Date(now + days * 86_400_000).toISOString(),
    description,
    impact,
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
    categories: ['全部', '市场', '宏观', '监管', '加密市场', '能源', '金属', '外汇'],
    events: upcomingEvents(),
    source: {
      provider: 'AD88 local news API proxy -> Yahoo Finance public search',
      mode: 'api',
      updatedAt: new Date().toISOString(),
      cacheState: 'fresh',
      endpoint,
    },
  };
}
