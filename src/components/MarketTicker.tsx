import type { MarketAsset } from '@/types';
import { getMarketIcon, getMarketProduct } from '@/data/assets';
import { useLanguage } from '@/context/language-context';
import { formatMarketPrice } from '@/lib/format';

function quote(value: number) {
  const price = formatMarketPrice(value);
  return value >= 1000 ? `$${price}` : price;
}

export function MarketTicker({ assets }: { assets: MarketAsset[] }) {
  const { t } = useLanguage();
  const preferred = ['BTC', 'XAU', 'CL', 'BRN', 'NG', 'RB', 'XAG', 'EURUSD', 'SPX'];
  const items = preferred.map((symbol) => assets.find((asset) => asset.symbol === symbol)).filter(Boolean) as MarketAsset[];
  return (
    <section className="ticker-strip" aria-label={t('ticker.todayMarket')}>
      <div className="ticker-strip__intro">
        <span className="status-dot status-dot--live" />
        <strong>{t('ticker.todayMarket')}</strong>
        <span>{t('ticker.day24')}</span>
      </div>
      <div className="ticker-strip__viewport">
        <div className="ticker-strip__track">
          {[...items, ...items].map((asset, index) => {
            const product = getMarketProduct(asset.symbol);
            const icon = getMarketIcon(asset.symbol);
            const positive = asset.change24h >= 0;
            return (
              <div key={`${asset.symbol}-${index}`} className="ticker-item">
                <span className={`asset-logo asset-logo--${product.tone} asset-logo--xs ${icon ? 'asset-logo--image' : ''}`} aria-hidden="true">
                  {icon ? <img className="asset-logo__image" src={icon} alt="" decoding="async" /> : product.mark}
                </span>
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
