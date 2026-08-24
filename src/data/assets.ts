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
  { symbol: 'LGO', name: 'Low Sulphur Gasoil', assetClass: 'commodity', providerSymbol: 'LGO=F', productId: undefined, mark: 'GO', tone: 'gasoil' },
  { symbol: 'PL', name: 'Platinum', assetClass: 'commodity', providerSymbol: 'PL=F', productId: undefined, mark: 'Pt', tone: 'platinum' },
  { symbol: 'PA', name: 'Palladium', assetClass: 'commodity', providerSymbol: 'PA=F', productId: undefined, mark: 'Pd', tone: 'palladium' },
  { symbol: 'CORN', name: 'Corn Futures', assetClass: 'commodity', providerSymbol: 'ZC=F', productId: undefined, mark: 'C', tone: 'corn' },
  { symbol: 'WHEAT', name: 'Wheat Futures', assetClass: 'commodity', providerSymbol: 'ZW=F', productId: undefined, mark: 'W', tone: 'wheat' },
  { symbol: 'COFFEE', name: 'Coffee Futures', assetClass: 'commodity', providerSymbol: 'KC=F', productId: undefined, mark: 'K', tone: 'coffee' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', providerSymbol: 'SOL-USD', productId: 'SOL-USD', geckoId: 'solana', mark: '◎', tone: 'solana' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'crypto', providerSymbol: 'XRP-USD', productId: 'XRP-USD', geckoId: 'ripple', mark: 'X', tone: 'xrp' },
  { symbol: 'LINK', name: 'Chainlink', assetClass: 'crypto', providerSymbol: 'LINK-USD', productId: 'LINK-USD', geckoId: 'chainlink', mark: 'L', tone: 'link' },
  { symbol: 'AVAX', name: 'Avalanche', assetClass: 'crypto', providerSymbol: 'AVAX-USD', productId: 'AVAX-USD', geckoId: 'avalanche-2', mark: 'A', tone: 'avax' },
  { symbol: 'EURUSD', name: 'EUR / USD', assetClass: 'forex', providerSymbol: 'EURUSD=X', productId: undefined, mark: '€$', tone: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP / USD', assetClass: 'forex', providerSymbol: 'GBPUSD=X', productId: undefined, mark: '£$', tone: 'forex' },
  { symbol: 'USDJPY', name: 'USD / JPY', assetClass: 'forex', providerSymbol: 'JPY=X', productId: undefined, mark: '$¥', tone: 'forex' },
  { symbol: 'AUDUSD', name: 'AUD / USD', assetClass: 'forex', providerSymbol: 'AUDUSD=X', productId: undefined, mark: 'A$', tone: 'forex' },
  { symbol: 'USDCAD', name: 'USD / CAD', assetClass: 'forex', providerSymbol: 'CAD=X', productId: undefined, mark: 'C$', tone: 'forex' },
  { symbol: 'SPX', name: 'S&P 500', assetClass: 'index', providerSymbol: '^GSPC', productId: undefined, mark: 'S&P', tone: 'index' },
  { symbol: 'NAS100', name: 'Nasdaq 100', assetClass: 'index', providerSymbol: '^NDX', productId: undefined, mark: 'NQ', tone: 'index' },
  { symbol: 'DAX', name: 'DAX 40', assetClass: 'index', providerSymbol: '^GDAXI', productId: undefined, mark: 'DAX', tone: 'index' },
] as const;

export type MarketProductSymbol = (typeof marketProducts)[number]['symbol'];

type ExecutionSpec = {
  /** Total sandbox bid/ask spread in the instrument quote currency. */
  spread: number;
  decimals: number;
};

export type TradeSpec = {
  /** Number of quote units represented by one standard lot. */
  contractSize: number;
  /** A sensible paper-account default; users may still adjust leverage. */
  defaultLeverage: number;
  minimumLots: number;
};

// One global contract size makes a 0.01 lot BTC order look like 0.0001 BTC
// and makes every other product's PnL equally misleading. Keep the paper
// ticket tied to the instrument catalogue so every existing or newly added
// symbol has a deterministic notional, margin and PnL calculation.
const tradeSpecs: Record<string, TradeSpec> = {
  XAU: { contractSize: 100, defaultLeverage: 20, minimumLots: 0.01 },
  XAG: { contractSize: 5_000, defaultLeverage: 20, minimumLots: 0.01 },
  CL: { contractSize: 1_000, defaultLeverage: 20, minimumLots: 0.01 },
  NG: { contractSize: 10_000, defaultLeverage: 20, minimumLots: 0.01 },
  HG: { contractSize: 25_000, defaultLeverage: 20, minimumLots: 0.01 },
  SCCO: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  BRN: { contractSize: 1_000, defaultLeverage: 20, minimumLots: 0.01 },
  HO: { contractSize: 42_000, defaultLeverage: 20, minimumLots: 0.01 },
  RB: { contractSize: 42_000, defaultLeverage: 20, minimumLots: 0.01 },
  LGO: { contractSize: 100, defaultLeverage: 20, minimumLots: 0.01 },
  PL: { contractSize: 50, defaultLeverage: 20, minimumLots: 0.01 },
  PA: { contractSize: 100, defaultLeverage: 20, minimumLots: 0.01 },
  CORN: { contractSize: 5_000, defaultLeverage: 10, minimumLots: 0.01 },
  WHEAT: { contractSize: 5_000, defaultLeverage: 10, minimumLots: 0.01 },
  COFFEE: { contractSize: 37_500, defaultLeverage: 10, minimumLots: 0.01 },
  BTC: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  ETH: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  SOL: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  XRP: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  LINK: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  AVAX: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  EURUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  GBPUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDJPY: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  AUDUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDCAD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  SPX: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  NAS100: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  DAX: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
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
  LINK: { spread: 0.012, decimals: 3 }, AVAX: { spread: 0.012, decimals: 3 },
  EURUSD: { spread: 0.00012, decimals: 5 }, GBPUSD: { spread: 0.00014, decimals: 5 },
  USDJPY: { spread: 0.012, decimals: 3 }, AUDUSD: { spread: 0.00012, decimals: 5 },
  USDCAD: { spread: 0.00014, decimals: 5 }, SPX: { spread: 0.80, decimals: 2 },
  NAS100: { spread: 2.00, decimals: 2 }, DAX: { spread: 1.20, decimals: 2 },
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

export function getTradeSpec(symbol: string): TradeSpec {
  return tradeSpecs[symbol.toUpperCase()] ?? { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 };
}
