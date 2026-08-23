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

// These are deliberately visible paper-trading execution spreads, rather than
// a claim about an exchange's order book. The two-sided quote is recalculated
// from the latest reference price on every price update.
const executionSpecs: Record<string, ExecutionSpec> = {
  XAU: { spread: 0.30, decimals: 2 }, XAG: { spread: 0.035, decimals: 3 },
  CL: { spread: 0.03, decimals: 3 }, NG: { spread: 0.006, decimals: 4 },
  HG: { spread: 0.004, decimals: 4 }, SCCO: { spread: 0.04, decimals: 2 },
  BRN: { spread: 0.03, decimals: 3 }, PL: { spread: 0.45, decimals: 2 },
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
