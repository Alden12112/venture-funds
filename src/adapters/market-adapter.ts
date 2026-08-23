import type { Candle, MarketAsset, MarketBundle, MarketQuote, OrderLevel, SourceMeta, TimeframeCode } from '@/types';
import { getMarketProduct, marketProducts } from '@/data/assets';

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
interface YahooChartResponse { chart?: { result?: YahooChartResult[] } }

type LoadedAsset = MarketAsset & {
  open24h: number;
  high24h: number;
  low24h: number;
  candles?: Candle[];
  orderBook?: { asks: OrderLevel[]; bids: OrderLevel[] };
  fallback?: boolean;
};

const timeframeMap: Record<TimeframeCode, { baseGranularity: number; aggregate: number }> = {
  M1: { baseGranularity: 60, aggregate: 1 }, M5: { baseGranularity: 300, aggregate: 1 }, M15: { baseGranularity: 900, aggregate: 1 },
  M30: { baseGranularity: 900, aggregate: 2 }, H1: { baseGranularity: 3600, aggregate: 1 }, H4: { baseGranularity: 3600, aggregate: 4 },
  D1: { baseGranularity: 86400, aggregate: 1 }, W1: { baseGranularity: 86400, aggregate: 7 }, MN: { baseGranularity: 86400, aggregate: 30 },
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
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function buildOrderLevels(levels: Array<[string, string, number]>, side: 'bid' | 'ask'): OrderLevel[] {
  let cumulative = 0;
  return levels.slice(0, 12).map(([price, size]) => {
    const parsedSize = toNumber(size);
    cumulative += parsedSize;
    return { price: toNumber(price), size: parsedSize, depth: cumulative, side };
  });
}

function spreadFor(product: typeof marketProducts[number]) {
  if (product.assetClass === 'forex') return 1.2;
  if (product.assetClass === 'commodity') return 5.5;
  if (product.assetClass === 'equity' || product.assetClass === 'index') return 7.5;
  return 4;
}

function buildSyntheticBook(price: number, product: typeof marketProducts[number]) {
  const spreadBps = spreadFor(product);
  const halfSpread = price * spreadBps / 20000;
  const tick = Math.max(price / 10000, halfSpread / 2);
  const asks: OrderLevel[] = [];
  const bids: OrderLevel[] = [];
  let askDepth = 0;
  let bidDepth = 0;
  for (let index = 0; index < 12; index += 1) {
    const askSize = Number((0.25 + index * 0.04).toFixed(4));
    const bidSize = Number((0.22 + index * 0.045).toFixed(4));
    askDepth += askSize;
    bidDepth += bidSize;
    asks.push({ price: price + halfSpread + tick * index, size: askSize, depth: askDepth, side: 'ask' });
    bids.push({ price: price - halfSpread - tick * index, size: bidSize, depth: bidDepth, side: 'bid' });
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
    PL: { price: 982.4, change: 0.21, volume: 1.4e9 }, PA: { price: 1028.5, change: -0.38, volume: 5.7e8 }, CORN: { price: 432.25, change: 0.15, volume: 1.2e9 },
    WHEAT: { price: 548.5, change: -0.27, volume: 1.1e9 }, COFFEE: { price: 312.8, change: 0.74, volume: 8.1e8 },
    EURUSD: { price: 1.0912, change: -0.12, volume: 3.2e10 }, GBPUSD: { price: 1.2748, change: 0.21, volume: 2.1e10 },
    USDJPY: { price: 156.42, change: 0.09, volume: 2.7e10 }, AUDUSD: { price: 0.6543, change: -0.08, volume: 1.4e10 }, USDCAD: { price: 1.3714, change: 0.04, volume: 1.6e10 },
    SPX: { price: 5615.2, change: 0.34, volume: 4.9e10 }, NAS100: { price: 19842.1, change: 0.48, volume: 3.2e10 }, DAX: { price: 18422.6, change: 0.26, volume: 1.9e10 },
    BTC: { price: 76000, change: 0.4, volume: 3.2e10 }, ETH: { price: 2400, change: 0.2, volume: 1.8e10 }, SOL: { price: 93, change: 0.1, volume: 1.2e10 },
    XRP: { price: 1.47, change: 0.1, volume: 4.3e9 }, LINK: { price: 11.3, change: 0.1, volume: 2.2e8 }, AVAX: { price: 7.4, change: 0.1, volume: 7.2e7 },
  };
  return values[symbol] ?? { price: 100, change: 0, volume: 1000000 };
}

function fallbackAsset(product: typeof marketProducts[number]): LoadedAsset {
  const snapshot = fallbackPrice(product.symbol);
  return {
    symbol: product.symbol, name: product.name, assetClass: product.assetClass, price: snapshot.price, change24h: snapshot.change, volume24h: snapshot.volume,
    spreadBps: spreadFor(product), updatedAt: new Date().toISOString(), open24h: snapshot.price / (1 + snapshot.change / 100), high24h: snapshot.price * 1.012,
    low24h: snapshot.price * 0.988, candles: makeFallbackCandles(snapshot.price, snapshot.change), orderBook: buildSyntheticBook(snapshot.price, product), fallback: true,
  };
}

async function loadCoinbaseAsset(product: typeof marketProducts[number]): Promise<LoadedAsset> {
  const [ticker, stats] = await Promise.all([getJson<CoinbaseTicker>(`${coinbaseBase}/products/${product.productId}/ticker`), getJson<CoinbaseStats>(`${coinbaseBase}/products/${product.productId}/stats`)]);
  const price = toNumber(ticker.price, toNumber(stats.last));
  const open = toNumber(stats.open, price);
  return { symbol: product.symbol, name: product.name, assetClass: product.assetClass, price, change24h: open ? ((price - open) / open) * 100 : 0, volume24h: toNumber(stats.volume, toNumber(ticker.volume)) * price, spreadBps: computeSpreadBasisPoints(toNumber(ticker.bid), toNumber(ticker.ask)), updatedAt: ticker.time, open24h: open, high24h: toNumber(stats.high, price), low24h: toNumber(stats.low, price) };
}

async function loadYahooAsset(product: typeof marketProducts[number]): Promise<LoadedAsset> {
  const data = await getJson<YahooChartResponse>(`/api/market?symbol=${encodeURIComponent(product.providerSymbol)}&range=1d&interval=15m`);
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
  return { symbol: product.symbol, name: product.name, assetClass: product.assetClass, price, change24h, volume24h: toNumber(meta.regularMarketVolume), spreadBps: spreadFor(product), updatedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(), open24h: previousClose, high24h: toNumber(meta.regularMarketDayHigh, price), low24h: toNumber(meta.regularMarketDayLow, price), candles: candles.length > 4 ? candles : makeFallbackCandles(price, change24h), orderBook: buildSyntheticBook(price, product) };
}

async function loadSelectedCoinbaseDetails(product: typeof marketProducts[number], timeframe: TimeframeCode, source: SourceMeta) {
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
  const selected: MarketQuote = { symbol: product.symbol, name: product.name, assetClass: product.assetClass, price, change24h: open24h ? ((price - open24h) / open24h) * 100 : 0, volume24h: toNumber(stats.volume, toNumber(ticker.volume)) * price, spreadBps: computeSpreadBasisPoints(toNumber(ticker.bid), toNumber(ticker.ask)), updatedAt: ticker.time, open24h, high24h: toNumber(stats.high, price), low24h: toNumber(stats.low, price), source };
  return { selected, orderBook: { asks, bids }, candles: aggregateCandles(candlesRaw.map(parseCandle).sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()), config.aggregate) };
}

export async function loadMarketBundle(symbol = 'BTC', timeframe: TimeframeCode = 'M15'): Promise<MarketBundle> {
  const requestStartedAt = Date.now();
  const selectedProduct = getMarketProduct(symbol);
  const loaded = await Promise.all(marketProducts.map(async (product) => {
    try { return product.assetClass === 'crypto' ? await loadCoinbaseAsset(product) : await loadYahooAsset(product); } catch { return fallbackAsset(product); }
  }));
  const selectedLoaded = loaded.find((asset) => asset.symbol === selectedProduct.symbol) ?? fallbackAsset(selectedProduct);
  const source: SourceMeta = { provider: selectedProduct.assetClass === 'crypto' ? 'Coinbase Exchange public market data' : 'Yahoo Finance public market data', mode: selectedLoaded.fallback ? 'mock' : 'api', updatedAt: selectedLoaded.updatedAt, cacheState: selectedLoaded.fallback ? 'stale' : 'fresh', endpoint: selectedProduct.assetClass === 'crypto' ? `${coinbaseBase}/products/*` : '/api/market', latencyMs: Math.max(1, Date.now() - requestStartedAt), health: selectedLoaded.fallback ? 'degraded' : 'healthy', lineage: 'provider → adapter → chart' };
  let selected: MarketQuote = { ...selectedLoaded, source };
  let orderBook = selectedLoaded.orderBook ?? buildSyntheticBook(selectedLoaded.price, selectedProduct);
  let candles = selectedLoaded.candles ?? makeFallbackCandles(selectedLoaded.price, selectedLoaded.change24h);
  if (selectedProduct.assetClass === 'crypto' && !selectedLoaded.fallback) {
    try { const detail = await loadSelectedCoinbaseDetails(selectedProduct, timeframe, source); selected = detail.selected; orderBook = detail.orderBook; candles = detail.candles; } catch { source.cacheState = 'cached'; }
  } else {
    const config = timeframeMap[timeframe] ?? timeframeMap.M15;
    candles = aggregateCandles(candles, config.aggregate);
  }
  const assets = loaded.map(({ open24h: _open, high24h: _high, low24h: _low, candles: _candles, orderBook: _book, fallback: _fallback, ...asset }) => asset);
  return { assets: assets.map((asset) => asset.symbol === selected.symbol ? { ...asset, ...selected } : asset), selected, candles, orderBook, depth: { bids: orderBook.bids.slice().reverse().map((level) => ({ price: level.price, cumulative: level.depth })), asks: orderBook.asks.map((level) => ({ price: level.price, cumulative: level.depth })) }, source: { ...source, updatedAt: selected.updatedAt, latencyMs: Math.max(1, Date.now() - requestStartedAt), health: source.cacheState === 'fresh' ? 'healthy' : source.cacheState === 'cached' ? 'degraded' : 'offline' } };
}

export function computeSpreadBasisPoints(bestBid: number, bestAsk: number) {
  if (!bestBid || !bestAsk) return 0;
  return ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10000;
}
