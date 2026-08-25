import type { Candle, DataCacheState, MarketAsset, MarketBundle, MarketQuote, OrderLevel, SourceMeta, TimeframeCode, MarketDataState } from '@/types';
import { getExecutionQuote, getMarketProduct, marketProducts } from '@/data/assets';

const coinbaseBase = 'https://api.exchange.coinbase.com';

interface CoinbaseTicker { ask: string; bid: string; volume: string; price: string; time: string; }
interface CoinbaseStats { open: string; high: string; low: string; last: string; volume: string; }
interface CoinbaseBook { bids: Array<[string, string, number]>; asks: Array<[string, string, number]>; }
type CoinbaseCandle = [number, number, number, number, number, number];

interface YahooChartResult {
  meta?: { regularMarketPrice?: number; regularMarketTime?: number; previousClose?: number; chartPreviousClose?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number; regularMarketVolume?: number };
  timestamp?: number[];
  indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
}
interface YahooChartResponse {
  ad88Fallback?: boolean;
  ad88Source?: string;
  ad88Cache?: DataCacheState;
  ad88Lineage?: string;
  chart?: { result?: YahooChartResult[] };
}

interface MarketSnapshotQuote {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  change24h?: number;
  volume24h?: number;
  quoteUpdatedAt?: string;
  dataState?: MarketDataState;
}

interface MarketSnapshotResponse {
  quotes?: Record<string, MarketSnapshotQuote>;
  updatedAt?: string;
}

type LoadedAsset = MarketAsset & {
  open24h: number;
  high24h: number;
  low24h: number;
  candles?: Candle[];
  orderBook?: { asks: OrderLevel[]; bids: OrderLevel[] };
  fallback?: boolean;
  cached?: boolean;
  provider?: string;
  providerCacheState?: DataCacheState;
  lineage?: string;
};

const marketCacheTtlMs = 2_000;
const detailCache = new Map<string, { expiresAt: number; value: { selected: MarketQuote; orderBook: { asks: OrderLevel[]; bids: OrderLevel[] }; candles: Candle[] } }>();
let snapshotCache: { expiresAt: number; value: Record<string, MarketSnapshotQuote> } | null = null;
let snapshotRequest: Promise<Record<string, MarketSnapshotQuote>> | null = null;

const timeframeMap: Record<TimeframeCode, { baseGranularity: number; aggregate: number }> = {
  M1: { baseGranularity: 60, aggregate: 1 }, M5: { baseGranularity: 300, aggregate: 1 }, M15: { baseGranularity: 900, aggregate: 1 },
  M30: { baseGranularity: 900, aggregate: 2 }, H1: { baseGranularity: 3600, aggregate: 1 }, H4: { baseGranularity: 3600, aggregate: 4 },
  D1: { baseGranularity: 86400, aggregate: 1 }, W1: { baseGranularity: 86400, aggregate: 7 }, MN: { baseGranularity: 86400, aggregate: 30 },
};

// The selected chart asks the server for the actual requested interval instead
// of stretching a 15-minute payload. This keeps M1/M5 and higher timeframes
// visually truthful when Twelve Data is available, while Yahoo remains a
// resilient fallback for the instruments it supports.
const marketTimeframeRequest: Record<TimeframeCode, { interval: string; range: string }> = {
  M1: { interval: '1m', range: '1d' }, M5: { interval: '5m', range: '5d' }, M15: { interval: '15m', range: '5d' },
  M30: { interval: '30m', range: '1mo' }, H1: { interval: '1h', range: '1mo' }, H4: { interval: '4h', range: '3mo' },
  D1: { interval: '1d', range: '1y' }, W1: { interval: '1wk', range: '5y' }, MN: { interval: '1mo', range: '10y' },
};

function toNumber(value: string | number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCandle(candle: CoinbaseCandle): Candle {
  const [time, low, high, open, close, volume] = candle;
  return { time: new Date(time * 1000).toISOString(), low, high, open, close, volume };
}

function aggregateCandles(candles: Candle[], size: number): Candle[] {
  if (size <= 1) return candles;
  const output: Candle[] = [];
  for (let index = 0; index < candles.length; index += size) {
    const chunk = candles.slice(index, index + size);
    if (!chunk.length) continue;
    output.push({ time: chunk[0].time, open: chunk[0].open, high: Math.max(...chunk.map((item) => item.high)), low: Math.min(...chunk.map((item) => item.low)), close: chunk.at(-1)?.close ?? chunk[0].close, volume: chunk.reduce((sum, item) => sum + item.volume, 0) });
  }
  return output;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

// Load every market row from one normalized server-side snapshot. This avoids
// sending a browser fan-out of nearly thirty third-party requests, and keeps
// the table, ticker and trade ticket on the exact same quote cycle.
async function loadQuoteSnapshot() {
  if (snapshotCache && snapshotCache.expiresAt > Date.now()) return snapshotCache.value;
  if (!snapshotRequest) {
    const symbols = marketProducts.map((product) => product.symbol).join(',');
    snapshotRequest = getJson<MarketSnapshotResponse>(`/api/market/quotes?symbols=${encodeURIComponent(symbols)}`)
      .then((payload) => payload.quotes ?? {})
      .finally(() => { snapshotRequest = null; });
  }
  const value = await snapshotRequest;
  snapshotCache = { expiresAt: Date.now() + marketCacheTtlMs, value };
  return value;
}

function buildOrderLevels(levels: Array<[string, string, number]>, side: 'bid' | 'ask'): OrderLevel[] {
  let cumulative = 0;
  return levels.slice(0, 12).map(([price, size]) => {
    const parsedSize = toNumber(size);
    cumulative += parsedSize;
    return { price: toNumber(price), size: parsedSize, depth: cumulative, side };
  });
}

function buildSyntheticBook(price: number, product: typeof marketProducts[number]) {
  const quote = getExecutionQuote(product.symbol, price);
  const tick = Math.max(10 ** -quote.decimals, quote.spread / 2);
  const asks: OrderLevel[] = [];
  const bids: OrderLevel[] = [];
  let askDepth = 0;
  let bidDepth = 0;
  for (let index = 0; index < 12; index += 1) {
    const askSize = Number((0.25 + index * 0.04).toFixed(4));
    const bidSize = Number((0.22 + index * 0.045).toFixed(4));
    askDepth += askSize;
    bidDepth += bidSize;
    asks.push({ price: Number((quote.ask + tick * index).toFixed(quote.decimals)), size: askSize, depth: askDepth, side: 'ask' });
    bids.push({ price: Number((quote.bid - tick * index).toFixed(quote.decimals)), size: bidSize, depth: bidDepth, side: 'bid' });
  }
  return { asks, bids };
}

function makeFallbackCandles(price: number, change24h: number) {
  const candles: Candle[] = [];
  const now = Date.now();
  const drift = price * (change24h / 100) / 48;
  for (let index = 0; index < 48; index += 1) {
    const close = price - drift * (47 - index) + Math.sin(index * 0.68) * price * 0.004;
    const open = close - Math.cos(index * 0.4) * price * 0.0018;
    candles.push({ time: new Date(now - (47 - index) * 15 * 60_000).toISOString(), open, high: Math.max(open, close) + price * 0.0022, low: Math.min(open, close) - price * 0.0022, close, volume: Math.abs(Math.sin(index * 0.37)) * 100 + 20 });
  }
  return candles;
}

function fallbackPrice(symbol: string) {
  const values: Record<string, { price: number; change: number; volume: number }> = {
    XAU: { price: 4680.6, change: 0.42, volume: 8.4e9 }, XAG: { price: 54.18, change: -0.18, volume: 1.6e9 },
    CL: { price: 79.22, change: 1.1, volume: 4.2e9 }, NG: { price: 2.86, change: -1.42, volume: 1.3e9 },
    HG: { price: 4.31, change: 0.68, volume: 1.1e9 }, SCCO: { price: 94.3, change: 0.36, volume: 2.8e8 }, BRN: { price: 82.14, change: 0.62, volume: 3.3e9 },
    HO: { price: 2.36, change: 0.48, volume: 8.8e8 }, RB: { price: 2.19, change: -0.37, volume: 7.4e8 }, LGO: { price: 1281.25, change: -2.33, volume: 6.5e8 },
    PL: { price: 982.4, change: 0.21, volume: 1.4e9 }, PA: { price: 1028.5, change: -0.38, volume: 5.7e8 }, CORN: { price: 432.25, change: 0.15, volume: 1.2e9 },
    WHEAT: { price: 548.5, change: -0.27, volume: 1.1e9 }, COFFEE: { price: 312.8, change: 0.74, volume: 8.1e8 },
    SUGAR: { price: 18.72, change: 0.36, volume: 4.4e8 }, COCOA: { price: 8275, change: -0.58, volume: 3.1e8 }, COTTON: { price: 68.4, change: 0.21, volume: 2.7e8 }, OATS: { price: 384.5, change: -0.14, volume: 1.8e8 }, LUMBER: { price: 612.2, change: 0.44, volume: 1.2e8 },
    EURUSD: { price: 1.0912, change: -0.12, volume: 3.2e10 }, GBPUSD: { price: 1.2748, change: 0.21, volume: 2.1e10 }, NZDUSD: { price: 0.5984, change: -0.16, volume: 8.4e9 }, USDCHF: { price: 0.8842, change: 0.08, volume: 1.1e10 }, EURGBP: { price: 0.8567, change: 0.05, volume: 9.2e9 },
    USDJPY: { price: 156.42, change: 0.09, volume: 2.7e10 }, AUDUSD: { price: 0.6543, change: -0.08, volume: 1.4e10 }, USDCAD: { price: 1.3714, change: 0.04, volume: 1.6e10 },
    SPX: { price: 5615.2, change: 0.34, volume: 4.9e10 }, NAS100: { price: 19842.1, change: 0.48, volume: 3.2e10 }, DAX: { price: 18422.6, change: 0.26, volume: 1.9e10 }, FTSE: { price: 8320.5, change: 0.31, volume: 1.4e10 }, CAC: { price: 7548.3, change: 0.18, volume: 1.2e10 }, NIKKEI: { price: 39110, change: 0.44, volume: 2.2e10 }, HSI: { price: 17840, change: -0.22, volume: 1.8e10 },
    BTC: { price: 76000, change: 0.4, volume: 3.2e10 }, ETH: { price: 2400, change: 0.2, volume: 1.8e10 }, SOL: { price: 93, change: 0.1, volume: 1.2e10 },
    XRP: { price: 1.47, change: 0.1, volume: 4.3e9 }, LINK: { price: 11.3, change: 0.1, volume: 2.2e8 }, AVAX: { price: 7.4, change: 0.1, volume: 7.2e7 }, DOGE: { price: 0.17, change: 0.1, volume: 2.8e9 }, ADA: { price: 0.62, change: 0.1, volume: 1.1e9 }, LTC: { price: 84, change: 0.1, volume: 5.6e8 }, BCH: { price: 390, change: 0.1, volume: 2.3e8 },
  };
  return values[symbol] ?? { price: 100, change: 0, volume: 1000000 };
}

function fallbackAsset(product: typeof marketProducts[number]): LoadedAsset {
  const snapshot = fallbackPrice(product.symbol);
  return {
    symbol: product.symbol, name: product.name, assetClass: product.assetClass, price: snapshot.price, change24h: snapshot.change, volume24h: snapshot.volume,
    spreadBps: getExecutionQuote(product.symbol, snapshot.price).spreadBps, updatedAt: new Date().toISOString(), open24h: snapshot.price / (1 + snapshot.change / 100), high24h: snapshot.price * 1.012,
    low24h: snapshot.price * 0.988, candles: makeFallbackCandles(snapshot.price, snapshot.change), orderBook: buildSyntheticBook(snapshot.price, product), fallback: true,
  };
}

function snapshotAsset(product: typeof marketProducts[number], quote: MarketSnapshotQuote | undefined): LoadedAsset {
  const price = toNumber(quote?.price);
  if (!price) return fallbackAsset(product);
  const change24h = toNumber(quote?.change24h);
  const open24h = change24h ? price / (1 + change24h / 100) : price;
  return {
    symbol: product.symbol,
    name: product.name,
    assetClass: product.assetClass,
    price,
    change24h,
    volume24h: toNumber(quote?.volume24h),
    spreadBps: getExecutionQuote(product.symbol, price).spreadBps,
    updatedAt: quote?.quoteUpdatedAt ?? new Date().toISOString(),
    open24h,
    high24h: Math.max(price, open24h),
    low24h: Math.min(price, open24h),
    orderBook: buildSyntheticBook(price, product),
    fallback: false,
    bid: toNumber(quote?.bid) || undefined,
    ask: toNumber(quote?.ask) || undefined,
    dataState: quote?.dataState ?? 'live',
    provider: quote?.dataState === 'broker' ? 'Broker reference feed' : 'AD88 market proxy',
    providerCacheState: 'fresh',
  };
}

async function loadYahooAsset(product: typeof marketProducts[number], provider: 'primary' | 'yahoo' = 'yahoo', interval = '15m', range = '1d'): Promise<LoadedAsset> {
  const data = await getJson<YahooChartResponse>(`/api/market?symbol=${encodeURIComponent(product.providerSymbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&provider=${provider}`);
  if (data.ad88Fallback) throw new Error(`Market provider fallback for ${product.symbol}`);
  const result = data.chart?.result?.[0];
  if (!result?.meta) throw new Error(`Market data unavailable for ${product.symbol}`);
  const meta = result.meta;
  const price = toNumber(meta.regularMarketPrice);
  const previousClose = toNumber(meta.previousClose, toNumber(meta.chartPreviousClose, price));
  if (!price) throw new Error(`Market price unavailable for ${product.symbol}`);
  const quote = result.indicators?.quote?.[0];
  const candles = (result.timestamp ?? []).map((time, index) => {
    const close = toNumber(quote?.close?.[index]);
    const open = toNumber(quote?.open?.[index], close);
    return { time: new Date(time * 1000).toISOString(), open, high: toNumber(quote?.high?.[index], Math.max(open, close)), low: toNumber(quote?.low?.[index], Math.min(open, close)), close, volume: toNumber(quote?.volume?.[index]) };
  }).filter((candle) => candle.close > 0);
  const change24h = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
  return { symbol: product.symbol, name: product.name, assetClass: product.assetClass, price, change24h, volume24h: toNumber(meta.regularMarketVolume), spreadBps: getExecutionQuote(product.symbol, price).spreadBps, updatedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(), open24h: previousClose, high24h: toNumber(meta.regularMarketDayHigh, price), low24h: toNumber(meta.regularMarketDayLow, price), candles: candles.length > 4 ? candles : makeFallbackCandles(price, change24h), orderBook: buildSyntheticBook(price, product), provider: data.ad88Source ?? 'Yahoo Finance', providerCacheState: data.ad88Cache ?? 'fresh', lineage: data.ad88Lineage };
}

async function loadSelectedCoinbaseDetails(product: typeof marketProducts[number], timeframe: TimeframeCode, source: SourceMeta) {
  const cacheKey = `${product.symbol}:${timeframe}`;
  const cached = detailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, selected: { ...cached.value.selected, source } };
  }
  const config = timeframeMap[timeframe] ?? timeframeMap.M15;
  const [stats, ticker, book, candlesRaw] = await Promise.all([
    getJson<CoinbaseStats>(`${coinbaseBase}/products/${product.productId}/stats`),
    getJson<CoinbaseTicker>(`${coinbaseBase}/products/${product.productId}/ticker`),
    getJson<CoinbaseBook>(`${coinbaseBase}/products/${product.productId}/book?level=2`),
    getJson<CoinbaseCandle[]>(`${coinbaseBase}/products/${product.productId}/candles?granularity=${config.baseGranularity}`),
  ]);
  const price = toNumber(ticker.price, toNumber(stats.last));
  const open24h = toNumber(stats.open, price);
  const asks = buildOrderLevels(book.asks, 'ask');
  const bids = buildOrderLevels(book.bids, 'bid');
  const selected: MarketQuote = { symbol: product.symbol, name: product.name, assetClass: product.assetClass, price, change24h: open24h ? ((price - open24h) / open24h) * 100 : 0, volume24h: toNumber(stats.volume, toNumber(ticker.volume)) * price, spreadBps: getExecutionQuote(product.symbol, price).spreadBps, updatedAt: ticker.time, open24h, high24h: toNumber(stats.high, price), low24h: toNumber(stats.low, price), source };
  const value = { selected, orderBook: { asks, bids }, candles: aggregateCandles(candlesRaw.map(parseCandle).sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()), config.aggregate) };
  detailCache.set(cacheKey, { expiresAt: Date.now() + marketCacheTtlMs, value });
  return value;
}

export async function loadMarketBundle(symbol = 'BTC', timeframe: TimeframeCode = 'M15'): Promise<MarketBundle> {
  const requestStartedAt = Date.now();
  const selectedProduct = getMarketProduct(symbol);
  let snapshots: Record<string, MarketSnapshotQuote> = {};
  try {
    snapshots = await loadQuoteSnapshot();
  } catch {
    // The existing local fallback retains a usable workbench if a public data
    // provider is temporarily unavailable.
  }
  const loaded = marketProducts.map((product) => snapshotAsset(product, snapshots[product.symbol]));
  let selectedLoaded = loaded.find((asset) => asset.symbol === selectedProduct.symbol) ?? fallbackAsset(selectedProduct);
  if (selectedProduct.assetClass !== 'crypto') {
    try {
      const request = marketTimeframeRequest[timeframe] ?? marketTimeframeRequest.M15;
      const chartLoaded = await loadYahooAsset(selectedProduct, 'primary', request.interval, request.range);
      // Candles can be supplied by a different public endpoint than the quote
      // snapshot. Retain the normalized current price so the selected ticket
      // never drifts away from the ticker and asset table.
      selectedLoaded = {
        ...chartLoaded,
        price: selectedLoaded.price,
        bid: selectedLoaded.bid,
        ask: selectedLoaded.ask,
        dataState: selectedLoaded.dataState,
        change24h: selectedLoaded.change24h,
        volume24h: selectedLoaded.volume24h,
        updatedAt: selectedLoaded.updatedAt,
        spreadBps: selectedLoaded.spreadBps,
        orderBook: selectedLoaded.orderBook,
      };
    } catch {
      // The catalogue price remains available from the resilient public-source path.
    }
  }
  const source: SourceMeta = {
    provider: selectedLoaded.dataState === 'broker'
      ? 'Broker reference feed'
      : selectedProduct.assetClass === 'crypto' ? 'Coinbase Exchange public market data' : selectedLoaded.provider ?? 'Yahoo Finance public market data',
    mode: selectedLoaded.dataState === 'broker' ? 'broker' : selectedLoaded.fallback ? 'mock' : 'api',
    updatedAt: selectedLoaded.updatedAt,
    cacheState: selectedLoaded.fallback ? 'stale' : selectedLoaded.cached ? 'cached' : selectedLoaded.providerCacheState ?? 'fresh',
    dataState: selectedLoaded.dataState ?? (selectedLoaded.fallback ? 'fallback' : 'live'),
    endpoint: selectedProduct.assetClass === 'crypto' ? `${coinbaseBase}/products/*` : '/api/market',
    latencyMs: Math.max(1, Date.now() - requestStartedAt),
    health: selectedLoaded.fallback ? 'degraded' : 'healthy',
    lineage: selectedProduct.assetClass === 'crypto' ? 'Coinbase Exchange → adapter → chart' : selectedLoaded.lineage ?? 'market provider → AD88 server proxy → adapter → chart',
  };
  let selected: MarketQuote = { ...selectedLoaded, source };
  let orderBook = selectedLoaded.orderBook ?? buildSyntheticBook(selectedLoaded.price, selectedProduct);
  let candles = selectedLoaded.candles ?? makeFallbackCandles(selectedLoaded.price, selectedLoaded.change24h);
  if (selectedProduct.assetClass === 'crypto' && !selectedLoaded.fallback) {
    try { const detail = await loadSelectedCoinbaseDetails(selectedProduct, timeframe, source); selected = detail.selected; orderBook = detail.orderBook; candles = detail.candles; } catch { source.cacheState = 'cached'; }
  }
  const assets = loaded.map(({ open24h: _open, high24h: _high, low24h: _low, candles: _candles, orderBook: _book, fallback: _fallback, ...asset }) => asset);
  return { assets: assets.map((asset) => asset.symbol === selected.symbol ? { ...asset, ...selected } : asset), selected, candles, orderBook, depth: { bids: orderBook.bids.slice().reverse().map((level) => ({ price: level.price, cumulative: level.depth })), asks: orderBook.asks.map((level) => ({ price: level.price, cumulative: level.depth })) }, source: { ...source, updatedAt: selected.updatedAt, latencyMs: Math.max(1, Date.now() - requestStartedAt), health: source.cacheState === 'fresh' ? 'healthy' : source.cacheState === 'cached' ? 'degraded' : 'offline' } };
}

export function computeSpreadBasisPoints(bestBid: number, bestAsk: number) {
  if (!bestBid || !bestAsk) return 0;
  return ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10000;
}

export async function loadIndicativeQuote(symbol: string) {
  const product = getMarketProduct(symbol);
  if (product.productId) throw new Error('Crypto quotes are streamed through the exchange ticker');
  const data = await getJson<YahooChartResponse>(`/api/market?symbol=${encodeURIComponent(product.providerSymbol)}&range=1d&interval=1m&fast=1&provider=primary`);
  if (data.ad88Fallback) throw new Error(`Market provider fallback for ${product.symbol}`);
  const meta = data.chart?.result?.[0]?.meta;
  const price = toNumber(meta?.regularMarketPrice);
  if (!price) throw new Error(`Market price unavailable for ${product.symbol}`);
  return {
    symbol: product.symbol,
    price,
    quoteUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
  };
}
