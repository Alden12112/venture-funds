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
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', providerSymbol: 'DOGE-USD', productId: 'DOGE-USD', geckoId: 'dogecoin', mark: 'Ð', tone: 'doge' },
  { symbol: 'ADA', name: 'Cardano', assetClass: 'crypto', providerSymbol: 'ADA-USD', productId: 'ADA-USD', geckoId: 'cardano', mark: '₳', tone: 'cardano' },
  { symbol: 'LTC', name: 'Litecoin', assetClass: 'crypto', providerSymbol: 'LTC-USD', productId: 'LTC-USD', geckoId: 'litecoin', mark: 'Ł', tone: 'litecoin' },
  { symbol: 'BCH', name: 'Bitcoin Cash', assetClass: 'crypto', providerSymbol: 'BCH-USD', productId: 'BCH-USD', geckoId: 'bitcoin-cash', mark: '₿', tone: 'bitcoin-cash' },
  { symbol: 'EURUSD', name: 'EUR / USD', assetClass: 'forex', providerSymbol: 'EURUSD=X', productId: undefined, mark: '€$', tone: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP / USD', assetClass: 'forex', providerSymbol: 'GBPUSD=X', productId: undefined, mark: '£$', tone: 'forex' },
  { symbol: 'USDJPY', name: 'USD / JPY', assetClass: 'forex', providerSymbol: 'JPY=X', productId: undefined, mark: '$¥', tone: 'forex' },
  { symbol: 'AUDUSD', name: 'AUD / USD', assetClass: 'forex', providerSymbol: 'AUDUSD=X', productId: undefined, mark: 'A$', tone: 'forex' },
  { symbol: 'USDCAD', name: 'USD / CAD', assetClass: 'forex', providerSymbol: 'CAD=X', productId: undefined, mark: 'C$', tone: 'forex' },
  { symbol: 'NZDUSD', name: 'NZD / USD', assetClass: 'forex', providerSymbol: 'NZDUSD=X', productId: undefined, mark: 'N$', tone: 'forex' },
  { symbol: 'USDCHF', name: 'USD / CHF', assetClass: 'forex', providerSymbol: 'CHF=X', productId: undefined, mark: '$₣', tone: 'forex' },
  { symbol: 'EURGBP', name: 'EUR / GBP', assetClass: 'forex', providerSymbol: 'EURGBP=X', productId: undefined, mark: '€£', tone: 'forex' },
  { symbol: 'EURJPY', name: 'EUR / JPY', assetClass: 'forex', providerSymbol: 'EURJPY=X', productId: undefined, mark: '€¥', tone: 'forex' },
  { symbol: 'GBPJPY', name: 'GBP / JPY', assetClass: 'forex', providerSymbol: 'GBPJPY=X', productId: undefined, mark: '£¥', tone: 'forex' },
  { symbol: 'EURCHF', name: 'EUR / CHF', assetClass: 'forex', providerSymbol: 'EURCHF=X', productId: undefined, mark: '€₣', tone: 'forex' },
  { symbol: 'USDCNH', name: 'USD / CNH', assetClass: 'forex', providerSymbol: 'CNH=X', productId: undefined, mark: '$¥', tone: 'forex' },
  { symbol: 'USDSGD', name: 'USD / SGD', assetClass: 'forex', providerSymbol: 'SGD=X', productId: undefined, mark: '$S', tone: 'forex' },
  { symbol: 'USDHKD', name: 'USD / HKD', assetClass: 'forex', providerSymbol: 'HKD=X', productId: undefined, mark: '$H', tone: 'forex' },
  { symbol: 'USDTRY', name: 'USD / TRY', assetClass: 'forex', providerSymbol: 'TRY=X', productId: undefined, mark: '$₺', tone: 'forex' },
  { symbol: 'USDZAR', name: 'USD / ZAR', assetClass: 'forex', providerSymbol: 'ZAR=X', productId: undefined, mark: '$R', tone: 'forex' },
  { symbol: 'SPX', name: 'S&P 500', assetClass: 'index', providerSymbol: '^GSPC', productId: undefined, mark: 'S&P', tone: 'index' },
  { symbol: 'NAS100', name: 'Nasdaq 100', assetClass: 'index', providerSymbol: '^NDX', productId: undefined, mark: 'NQ', tone: 'index' },
  { symbol: 'DAX', name: 'DAX 40', assetClass: 'index', providerSymbol: '^GDAXI', productId: undefined, mark: 'DAX', tone: 'index' },
  { symbol: 'FTSE', name: 'FTSE 100', assetClass: 'index', providerSymbol: '^FTSE', productId: undefined, mark: 'UKX', tone: 'index' },
  { symbol: 'CAC', name: 'CAC 40', assetClass: 'index', providerSymbol: '^FCHI', productId: undefined, mark: 'CAC', tone: 'index' },
  { symbol: 'NIKKEI', name: 'Nikkei 225', assetClass: 'index', providerSymbol: '^N225', productId: undefined, mark: 'N225', tone: 'index' },
  { symbol: 'HSI', name: 'Hang Seng', assetClass: 'index', providerSymbol: '^HSI', productId: undefined, mark: 'HSI', tone: 'index' },
  { symbol: 'DJ30', name: 'Dow Jones 30', assetClass: 'index', providerSymbol: '^DJI', productId: undefined, mark: 'DJ', tone: 'index' },
  { symbol: 'RUSSELL', name: 'Russell 2000', assetClass: 'index', providerSymbol: '^RUT', productId: undefined, mark: 'R2K', tone: 'index' },
  { symbol: 'SUGAR', name: 'Sugar Futures', assetClass: 'commodity', providerSymbol: 'SB=F', productId: undefined, mark: 'S', tone: 'sugar' },
  { symbol: 'COCOA', name: 'Cocoa Futures', assetClass: 'commodity', providerSymbol: 'CC=F', productId: undefined, mark: 'C', tone: 'cocoa' },
  { symbol: 'COTTON', name: 'Cotton Futures', assetClass: 'commodity', providerSymbol: 'CT=F', productId: undefined, mark: 'Ct', tone: 'cotton' },
  { symbol: 'OATS', name: 'Oats Futures', assetClass: 'commodity', providerSymbol: 'ZO=F', productId: undefined, mark: 'O', tone: 'oats' },
  { symbol: 'LUMBER', name: 'Lumber Futures', assetClass: 'commodity', providerSymbol: 'LBS=F', productId: undefined, mark: 'L', tone: 'lumber' },
  { symbol: 'SOYBEAN', name: 'Soybean Futures', assetClass: 'commodity', providerSymbol: 'ZS=F', productId: undefined, mark: 'Sb', tone: 'soybean' },
  { symbol: 'SOYMEAL', name: 'Soybean Meal', assetClass: 'commodity', providerSymbol: 'ZM=F', productId: undefined, mark: 'Sm', tone: 'soymeal' },
  { symbol: 'SOYOIL', name: 'Soybean Oil', assetClass: 'commodity', providerSymbol: 'ZL=F', productId: undefined, mark: 'So', tone: 'soyoil' },
  { symbol: 'CATTLE', name: 'Live Cattle', assetClass: 'commodity', providerSymbol: 'LE=F', productId: undefined, mark: 'Lc', tone: 'cattle' },
  { symbol: 'HOGS', name: 'Lean Hogs', assetClass: 'commodity', providerSymbol: 'HE=F', productId: undefined, mark: 'Lh', tone: 'hogs' },
  { symbol: 'ORANGE', name: 'Orange Juice', assetClass: 'commodity', providerSymbol: 'OJ=F', productId: undefined, mark: 'Oj', tone: 'orange' },
] as const;

export type MarketProductSymbol = (typeof marketProducts)[number]['symbol'];

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
  DOGE: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  ADA: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  LTC: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  BCH: { contractSize: 1, defaultLeverage: 5, minimumLots: 0.01 },
  EURUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  GBPUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDJPY: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  AUDUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDCAD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  NZDUSD: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDCHF: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  EURGBP: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  EURJPY: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  GBPJPY: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  EURCHF: { contractSize: 100_000, defaultLeverage: 30, minimumLots: 0.01 },
  USDCNH: { contractSize: 100_000, defaultLeverage: 20, minimumLots: 0.01 },
  USDSGD: { contractSize: 100_000, defaultLeverage: 20, minimumLots: 0.01 },
  USDHKD: { contractSize: 100_000, defaultLeverage: 20, minimumLots: 0.01 },
  USDTRY: { contractSize: 100_000, defaultLeverage: 10, minimumLots: 0.01 },
  USDZAR: { contractSize: 100_000, defaultLeverage: 10, minimumLots: 0.01 },
  SPX: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  NAS100: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  DAX: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  FTSE: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  CAC: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  NIKKEI: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  HSI: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  DJ30: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  RUSSELL: { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 },
  SUGAR: { contractSize: 11_200, defaultLeverage: 10, minimumLots: 0.01 },
  COCOA: { contractSize: 10_000, defaultLeverage: 10, minimumLots: 0.01 },
  COTTON: { contractSize: 50_000, defaultLeverage: 10, minimumLots: 0.01 },
  OATS: { contractSize: 5_000, defaultLeverage: 10, minimumLots: 0.01 },
  LUMBER: { contractSize: 110, defaultLeverage: 10, minimumLots: 0.01 },
  SOYBEAN: { contractSize: 5_000, defaultLeverage: 10, minimumLots: 0.01 },
  SOYMEAL: { contractSize: 100, defaultLeverage: 10, minimumLots: 0.01 },
  SOYOIL: { contractSize: 60_000, defaultLeverage: 10, minimumLots: 0.01 },
  CATTLE: { contractSize: 40_000, defaultLeverage: 10, minimumLots: 0.01 },
  HOGS: { contractSize: 40_000, defaultLeverage: 10, minimumLots: 0.01 },
  ORANGE: { contractSize: 15_000, defaultLeverage: 10, minimumLots: 0.01 },
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

export function getTradeSpec(symbol: string): TradeSpec {
  return tradeSpecs[symbol.toUpperCase()] ?? { contractSize: 1, defaultLeverage: 10, minimumLots: 0.01 };
}
