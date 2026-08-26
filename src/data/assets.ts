export const marketProducts = [
  { symbol: 'XAU', name: 'Gold / XAU', assetClass: 'commodity', providerSymbol: 'GC=F', productId: undefined, mark: 'Au', tone: 'gold' },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', providerSymbol: 'BTC-USD', productId: 'BTC-USD', geckoId: 'bitcoin', mark: '₿', tone: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', providerSymbol: 'ETH-USD', productId: 'ETH-USD', geckoId: 'ethereum', mark: 'Ξ', tone: 'ethereum' },
  { symbol: 'CL', name: 'Crude Oil WTI', assetClass: 'commodity', providerSymbol: 'CL=F', productId: undefined, mark: 'WTI', tone: 'crude' },
  { symbol: 'NG', name: 'Natural Gas', assetClass: 'commodity', providerSymbol: 'NG=F', productId: undefined, mark: 'NG', tone: 'gas' },
  { symbol: 'XAG', name: 'Silver / XAG', assetClass: 'commodity', providerSymbol: 'SI=F', productId: undefined, mark: 'Ag', tone: 'silver' },
  { symbol: 'HG', name: 'Copper', assetClass: 'commodity', providerSymbol: 'HG=F', productId: undefined, mark: 'Cu', tone: 'copper' },
  { symbol: 'SCCO', name: 'Southern Copper', assetClass: 'equity', providerSymbol: 'SCCO', productId: undefined, mark: 'SC', tone: 'southern-copper' },
  { symbol: 'BRN', name: 'Brent Crude Oil', assetClass: 'commodity', providerSymbol: 'BZ=F', productId: undefined, mark: 'Brent', tone: 'brent' },
  { symbol: 'HO', name: 'Heating Oil', assetClass: 'commodity', providerSymbol: 'HO=F', productId: undefined, mark: 'HO', tone: 'heating-oil' },
  { symbol: 'RB', name: 'RBOB Gasoline', assetClass: 'commodity', providerSymbol: 'RB=F', productId: undefined, mark: 'RB', tone: 'gasoline' },
  { symbol: 'PL', name: 'Platinum', assetClass: 'commodity', providerSymbol: 'PL=F', productId: undefined, mark: 'Pt', tone: 'platinum' },
  { symbol: 'PA', name: 'Palladium', assetClass: 'commodity', providerSymbol: 'PA=F', productId: undefined, mark: 'Pd', tone: 'palladium' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', providerSymbol: 'SOL-USD', productId: 'SOL-USD', geckoId: 'solana', mark: '◎', tone: 'solana' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'crypto', providerSymbol: 'XRP-USD', productId: 'XRP-USD', geckoId: 'ripple', mark: 'X', tone: 'xrp' },
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', providerSymbol: 'DOGE-USD', productId: 'DOGE-USD', geckoId: 'dogecoin', mark: 'Ð', tone: 'doge' },
  { symbol: 'EURUSD', name: 'EUR / USD', assetClass: 'forex', providerSymbol: 'EURUSD=X', productId: undefined, mark: '€$', tone: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP / USD', assetClass: 'forex', providerSymbol: 'GBPUSD=X', productId: undefined, mark: '£$', tone: 'forex' },
  { symbol: 'USDJPY', name: 'USD / JPY', assetClass: 'forex', providerSymbol: 'JPY=X', productId: undefined, mark: '$¥', tone: 'forex' },
  { symbol: 'AUDUSD', name: 'AUD / USD', assetClass: 'forex', providerSymbol: 'AUDUSD=X', productId: undefined, mark: 'A$', tone: 'forex' },
  { symbol: 'USDCAD', name: 'USD / CAD', assetClass: 'forex', providerSymbol: 'CAD=X', productId: undefined, mark: 'C$', tone: 'forex' },
  { symbol: 'USDCHF', name: 'USD / CHF', assetClass: 'forex', providerSymbol: 'CHF=X', productId: undefined, mark: '$₣', tone: 'forex' },
  { symbol: 'EURJPY', name: 'EUR / JPY', assetClass: 'forex', providerSymbol: 'EURJPY=X', productId: undefined, mark: '€¥', tone: 'forex' },
  { symbol: 'SPX', name: 'S&P 500', assetClass: 'index', providerSymbol: '^GSPC', productId: undefined, mark: 'S&P', tone: 'index' },
  { symbol: 'NAS100', name: 'Nasdaq 100', assetClass: 'index', providerSymbol: '^NDX', productId: undefined, mark: 'NQ', tone: 'index' },
  { symbol: 'DAX', name: 'DAX 40', assetClass: 'index', providerSymbol: '^GDAXI', productId: undefined, mark: 'DAX', tone: 'index' },
  { symbol: 'FTSE', name: 'FTSE 100', assetClass: 'index', providerSymbol: '^FTSE', productId: undefined, mark: 'UKX', tone: 'index' },
  { symbol: 'NIKKEI', name: 'Nikkei 225', assetClass: 'index', providerSymbol: '^N225', productId: undefined, mark: 'N225', tone: 'index' },
  { symbol: 'HSI', name: 'Hang Seng', assetClass: 'index', providerSymbol: '^HSI', productId: undefined, mark: 'HSI', tone: 'index' },
  { symbol: 'DJ30', name: 'Dow Jones 30', assetClass: 'index', providerSymbol: '^DJI', productId: undefined, mark: 'DJ', tone: 'index' },
] as const;

export type MarketProductSymbol = (typeof marketProducts)[number]['symbol'];

// These are editorial photographs used only in the large selected-instrument
// treatment. Small row/chip marks stay vector-like so the table remains fast
// to scan. The images are locally bundled rather than fetched from a third
// party at runtime.
const marketVisuals: Partial<Record<MarketProductSymbol, string>> = {
  // The hero artwork uses local editorial imagery for the two instruments
  // users scan first. Small row marks remain vector-like for fast scanning.
  XAU: '/assets/market/gold-bullion.png',
  XAG: '/assets/market/metals-silver.svg',
  HG: '/assets/market/metals-copper.svg',
  SCCO: '/assets/market/metals-copper.svg',
  PL: '/assets/market/metals-platinum.svg',
  PA: '/assets/market/metals-platinum.svg',
  CL: '/assets/market/crude-pumpjack.png',
  NG: '/assets/market/energy-gas.svg',
  BRN: '/assets/market/crude-pumpjack.png',
  HO: '/assets/market/energy-refinery.svg',
  RB: '/assets/market/energy-refinery.svg',
  EURUSD: '/assets/market/fx-crossflow.svg',
  GBPUSD: '/assets/market/fx-crossflow.svg',
  USDJPY: '/assets/market/fx-crossflow.svg',
  AUDUSD: '/assets/market/fx-crossflow.svg',
  USDCAD: '/assets/market/fx-crossflow.svg',
  USDCHF: '/assets/market/fx-crossflow.svg',
  EURJPY: '/assets/market/fx-crossflow.svg',
  SPX: '/assets/market/index-grid.svg',
  NAS100: '/assets/market/index-grid.svg',
  DAX: '/assets/market/index-grid.svg',
  FTSE: '/assets/market/index-grid.svg',
  NIKKEI: '/assets/market/index-grid.svg',
  HSI: '/assets/market/index-grid.svg',
  DJ30: '/assets/market/index-grid.svg',
};

// Crisp coin marks are used throughout the live table, ticker and positions.
// They make crypto assets as fast to identify as the reference the user
// supplied, without borrowing a third-party site's presentation.
const marketIcons: Partial<Record<MarketProductSymbol, string>> = {
  BTC: '/assets/crypto/btc.png',
  ETH: '/assets/crypto/eth.png',
  SOL: '/assets/crypto/sol.png',
  XRP: '/assets/crypto/xrp.png',
  DOGE: '/assets/crypto/doge.png',
};

// The first view is an editorial market shelf, not an arbitrary catalogue
// order. Keep the instruments with the clearest local artwork in front while
// preserving a deterministic order for the remaining symbols. This is also
// used by the table and chip selector, so the two surfaces never disagree.
const featuredArtworkOrder: MarketProductSymbol[] = [
  'BTC', 'ETH', 'XAU', 'CL', 'NG', 'XAG', 'HG', 'SCCO', 'BRN', 'SOL', 'XRP', 'DOGE',
  'HO', 'RB', 'PL', 'PA', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURJPY',
  'SPX', 'NAS100', 'DAX', 'FTSE', 'NIKKEI', 'HSI', 'DJ30',
];

// Provider payloads stay normalized in English; the interface resolves the
// same stable symbol into the language selected by the user.
export function assetNameKey(symbol: string) {
  return `asset.${symbol.toUpperCase()}`;
}

export function assetClassKey(assetClass: string) {
  return `market.class.${assetClass}`;
}

type ExecutionSpec = {
  /** Total sandbox bid/ask spread in the instrument quote currency. */
  spread: number;
  decimals: number;
};

export type TradeSpec = {
  /** Number of quote units represented by one standard lot. */
  contractSize: number;
  /** Server-owned paper risk profile mirrored in the client preview. */
  defaultLeverage: number;
  minimumLots: number;
};

// One global contract size makes a 0.01 lot BTC order look like 0.0001 BTC
// and makes every other product's PnL equally misleading. Keep the paper
// ticket tied to the instrument catalogue so every existing or newly added
// symbol has a deterministic notional, margin and PnL calculation.
const tradeSpecs: Record<string, TradeSpec> = {
  XAU: { contractSize: 100, defaultLeverage: 500, minimumLots: 0.01 },
  XAG: { contractSize: 5_000, defaultLeverage: 500, minimumLots: 0.01 },
  CL: { contractSize: 1_000, defaultLeverage: 500, minimumLots: 0.01 },
  NG: { contractSize: 10_000, defaultLeverage: 500, minimumLots: 0.01 },
  HG: { contractSize: 25_000, defaultLeverage: 500, minimumLots: 0.01 },
  SCCO: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  BRN: { contractSize: 1_000, defaultLeverage: 500, minimumLots: 0.01 },
  HO: { contractSize: 42_000, defaultLeverage: 500, minimumLots: 0.01 },
  RB: { contractSize: 42_000, defaultLeverage: 500, minimumLots: 0.01 },
  PL: { contractSize: 50, defaultLeverage: 500, minimumLots: 0.01 },
  PA: { contractSize: 100, defaultLeverage: 500, minimumLots: 0.01 },
  BTC: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  ETH: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  SOL: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  XRP: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  DOGE: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  EURUSD: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  GBPUSD: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  USDJPY: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  AUDUSD: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  USDCAD: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  USDCHF: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  EURJPY: { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 },
  SPX: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  NAS100: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  DAX: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  FTSE: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  NIKKEI: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  HSI: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
  DJ30: { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 },
};

// These are deliberately visible paper-trading execution spreads, rather than
// a claim about an exchange's order book. The two-sided quote is recalculated
// from the latest reference price on every price update.
const executionSpecs: Record<string, ExecutionSpec> = {
  XAU: { spread: 0.30, decimals: 2 }, XAG: { spread: 0.035, decimals: 3 },
  CL: { spread: 0.03, decimals: 3 }, NG: { spread: 0.006, decimals: 4 },
  HG: { spread: 0.004, decimals: 4 }, SCCO: { spread: 0.04, decimals: 2 },
  BRN: { spread: 0.03, decimals: 3 }, PL: { spread: 0.45, decimals: 2 },
  HO: { spread: 0.004, decimals: 4 }, RB: { spread: 0.004, decimals: 4 }, LGO: { spread: 0.80, decimals: 2 },
  PA: { spread: 0.65, decimals: 2 }, CORN: { spread: 0.25, decimals: 2 },
  WHEAT: { spread: 0.25, decimals: 2 }, COFFEE: { spread: 0.30, decimals: 2 },
  BTC: { spread: 8, decimals: 2 }, ETH: { spread: 0.60, decimals: 2 },
  SOL: { spread: 0.05, decimals: 3 }, XRP: { spread: 0.0012, decimals: 4 },
  LINK: { spread: 0.012, decimals: 3 }, AVAX: { spread: 0.012, decimals: 3 }, DOGE: { spread: 0.0008, decimals: 5 },
  ADA: { spread: 0.0012, decimals: 5 }, LTC: { spread: 0.08, decimals: 2 }, BCH: { spread: 0.9, decimals: 2 },
  EURUSD: { spread: 0.00012, decimals: 5 }, GBPUSD: { spread: 0.00014, decimals: 5 },
  USDJPY: { spread: 0.012, decimals: 3 }, AUDUSD: { spread: 0.00012, decimals: 5 },
  USDCAD: { spread: 0.00014, decimals: 5 }, NZDUSD: { spread: 0.00014, decimals: 5 }, USDCHF: { spread: 0.00014, decimals: 5 }, EURGBP: { spread: 0.00014, decimals: 5 },
  EURJPY: { spread: 0.014, decimals: 3 }, GBPJPY: { spread: 0.016, decimals: 3 }, EURCHF: { spread: 0.00014, decimals: 5 }, USDCNH: { spread: 0.0005, decimals: 5 }, USDSGD: { spread: 0.00018, decimals: 5 }, USDHKD: { spread: 0.00016, decimals: 5 }, USDTRY: { spread: 0.012, decimals: 3 }, USDZAR: { spread: 0.006, decimals: 4 },
  SPX: { spread: 0.80, decimals: 2 }, NAS100: { spread: 2.00, decimals: 2 }, DAX: { spread: 1.20, decimals: 2 }, FTSE: { spread: 1.20, decimals: 2 }, CAC: { spread: 1.20, decimals: 2 }, NIKKEI: { spread: 12, decimals: 2 }, HSI: { spread: 10, decimals: 2 }, DJ30: { spread: 2.20, decimals: 2 }, RUSSELL: { spread: 0.65, decimals: 2 },
  SUGAR: { spread: 0.04, decimals: 4 }, COCOA: { spread: 3, decimals: 2 }, COTTON: { spread: 0.08, decimals: 4 }, OATS: { spread: 0.15, decimals: 2 }, LUMBER: { spread: 1.5, decimals: 2 },
  SOYBEAN: { spread: 0.25, decimals: 2 }, SOYMEAL: { spread: 0.30, decimals: 2 }, SOYOIL: { spread: 0.04, decimals: 4 }, CATTLE: { spread: 0.08, decimals: 4 }, HOGS: { spread: 0.08, decimals: 4 }, ORANGE: { spread: 0.10, decimals: 2 },
};

function roundQuote(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

export function getExecutionQuote(symbol: string, referencePrice: number) {
  const spec = executionSpecs[symbol.toUpperCase()] ?? { spread: Math.max(referencePrice * 0.0005, 0.01), decimals: referencePrice < 1 ? 5 : 2 };
  const halfSpread = spec.spread / 2;
  const bid = roundQuote(Math.max(0, referencePrice - halfSpread), spec.decimals);
  const ask = roundQuote(referencePrice + halfSpread, spec.decimals);
  const spread = roundQuote(Math.max(0, ask - bid), spec.decimals);
  return {
    bid,
    ask,
    spread,
    decimals: spec.decimals,
    spreadBps: referencePrice ? (spread / referencePrice) * 10_000 : 0,
  };
}

export function getMarketProduct(symbol: string) {
  return marketProducts.find((product) => product.symbol === symbol.toUpperCase()) ?? marketProducts[0];
}

export function getMarketVisual(symbol: string) {
  return marketVisuals[symbol.toUpperCase() as MarketProductSymbol];
}

export function getMarketIcon(symbol: string) {
  return marketIcons[symbol.toUpperCase() as MarketProductSymbol];
}

export function getMarketArtworkPriority(symbol: string) {
  const normalized = symbol.toUpperCase() as MarketProductSymbol;
  const order = featuredArtworkOrder.indexOf(normalized);
  const hasEditorialArtwork = Boolean(marketVisuals[normalized]);
  const hasRecognizableIcon = Boolean(marketIcons[normalized]);
  const rank = order < 0 ? 0 : featuredArtworkOrder.length - order;
  // Rank is the primary signal so BTC → ETH → XAU remains the deliberate
  // opening shelf. Artwork availability only breaks ties and keeps any
  // future unranked item with a real visual above a text-only fallback.
  const assetSignal = hasEditorialArtwork ? 20 : hasRecognizableIcon ? 10 : 0;
  return rank * 1_000 + assetSignal;
}

export function getTradeSpec(symbol: string): TradeSpec {
  return tradeSpecs[symbol.toUpperCase()] ?? { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 };
}
