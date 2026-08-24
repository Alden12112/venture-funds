import type { MarketAsset } from '@/types';
import { getMarketProduct } from '@/data/assets';

function quote(value: number) {
  if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (value < 10) return value.toFixed(4);
  return value.toFixed(2);
}

export function MarketTicker({ assets }: { assets: MarketAsset[] }) {
  const preferred = ['BTC', 'XAU', 'CL', 'BRN', 'NG', 'RB', 'XAG', 'EURUSD', 'SPX'];
  const items = preferred.map((symbol) => assets.find((asset) => asset.symbol === symbol)).filter(Boolean) as MarketAsset[];
  return (
    <section className="ticker-strip" aria-label="Today’s market movement">
      <div className="ticker-strip__intro">
        <span className="status-dot status-dot--live" />
        <strong>Today’s market</strong>
        <span>24h</span>
      </div>
      <div className="ticker-strip__viewport">
        <div className="ticker-strip__track">
          {[...items, ...items].map((asset, index) => {
            const product = getMarketProduct(asset.symbol);
            const positive = asset.change24h >= 0;
            return (
              <div key={`${asset.symbol}-${index}`} className="ticker-item">
                <span className={`asset-logo asset-logo--${product.tone} asset-logo--xs`} aria-hidden="true">{product.mark}</span>
                <span className="ticker-item__name">{asset.symbol}</span>
                <strong>{quote(asset.price)}</strong>
                <span className={positive ? 'trend trend--up' : 'trend trend--down'}>{positive ? '+' : ''}{asset.change24h.toFixed(2)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
