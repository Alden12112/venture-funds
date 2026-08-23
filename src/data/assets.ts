export const marketProducts = [
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', providerSymbol: 'BTC-USD', productId: 'BTC-USD', geckoId: 'bitcoin', mark: '₿', tone: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', providerSymbol: 'ETH-USD', productId: 'ETH-USD', geckoId: 'ethereum', mark: 'Ξ', tone: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto', providerSymbol: 'SOL-USD', productId: 'SOL-USD', geckoId: 'solana', mark: '◎', tone: 'solana' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'crypto', providerSymbol: 'XRP-USD', productId: 'XRP-USD', geckoId: 'ripple', mark: 'X', tone: 'xrp' },
  { symbol: 'LINK', name: 'Chainlink', assetClass: 'crypto', providerSymbol: 'LINK-USD', productId: 'LINK-USD', geckoId: 'chainlink', mark: 'L', tone: 'link' },
  { symbol: 'AVAX', name: 'Avalanche', assetClass: 'crypto', providerSymbol: 'AVAX-USD', productId: 'AVAX-USD', geckoId: 'avalanche-2', mark: 'A', tone: 'avax' },
  { symbol: 'XAU', name: 'Gold / XAU', assetClass: 'commodity', providerSymbol: 'GC=F', productId: undefined, mark: 'Au', tone: 'gold' },
  { symbol: 'XAG', name: 'Silver / XAG', assetClass: 'commodity', providerSymbol: 'SI=F', productId: undefined, mark: 'Ag', tone: 'silver' },
  { symbol: 'CL', name: 'Crude Oil WTI', assetClass: 'commodity', providerSymbol: 'CL=F', productId: undefined, mark: 'CL', tone: 'crude' },
  { symbol: 'NG', name: 'Natural Gas', assetClass: 'commodity', providerSymbol: 'NG=F', productId: undefined, mark: 'NG', tone: 'gas' },
  { symbol: 'HG', name: 'Copper', assetClass: 'commodity', providerSymbol: 'HG=F', productId: undefined, mark: 'Cu', tone: 'copper' },
  { symbol: 'SCCO', name: 'Southern Copper', assetClass: 'equity', providerSymbol: 'SCCO', productId: undefined, mark: 'SC', tone: 'southern-copper' },
  { symbol: 'EURUSD', name: 'EUR / USD', assetClass: 'forex', providerSymbol: 'EURUSD=X', productId: undefined, mark: '€$', tone: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP / USD', assetClass: 'forex', providerSymbol: 'GBPUSD=X', productId: undefined, mark: '£$', tone: 'forex' },
  { symbol: 'USDJPY', name: 'USD / JPY', assetClass: 'forex', providerSymbol: 'JPY=X', productId: undefined, mark: '$¥', tone: 'forex' },
  { symbol: 'SPX', name: 'S&P 500', assetClass: 'index', providerSymbol: '^GSPC', productId: undefined, mark: 'S&P', tone: 'index' },
] as const;

export type MarketProductSymbol = (typeof marketProducts)[number]['symbol'];

export function getMarketProduct(symbol: string) {
  return marketProducts.find((product) => product.symbol === symbol.toUpperCase()) ?? marketProducts[0];
}
