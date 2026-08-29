import { getMarketIcon, getMarketProduct } from '@/data/assets';

type AssetLogoSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * One shared asset mark for the market shelf, observation workspace and
 * result history. Keeping the resolver in one component prevents detail
 * surfaces from falling back to a dark text badge when the market list has a
 * real coin mark available.
 */
export function AssetLogo({
  symbol,
  size = 'md',
  className = '',
}: {
  symbol: string;
  size?: AssetLogoSize;
  className?: string;
}) {
  const product = getMarketProduct(symbol);
  const icon = getMarketIcon(symbol);
  const classes = ['asset-logo', `asset-logo--${product.tone}`, `asset-logo--${size}`, icon ? 'asset-logo--image' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} aria-hidden="true">
      {icon ? <img className="asset-logo__image" src={icon} alt="" decoding="async" /> : product.mark}
    </span>
  );
}
