import { Link } from 'react-router-dom';
import { ArrowRight, LogIn } from 'lucide-react';
import { brand, brandMarkers } from '@/data/brand';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { formatCurrency, formatPercent, formatCompact } from '@/lib/format';
import { DataMeta, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { Sparkline } from '@/components/Charts';
import { useLanguage } from '@/context/language-context';

export function LandingPage() {
  const { language, setLanguage, t } = useLanguage();
  const market = useAsyncResource(() => loadMarketBundle('BTC'), []);

  const selected = market.status === 'success' ? market.data.selected : null;
  const btc = market.status === 'success' ? market.data.assets.find((item) => item.symbol === 'BTC') : null;
  const eth = market.status === 'success' ? market.data.assets.find((item) => item.symbol === 'ETH') : null;

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <Link to="/" className="brand-lockup brand-lockup--landing">
          <span className="brand-lockup__mark">{brand.name}</span>
          <span className="brand-lockup__name">{brand.english}</span>
        </Link>
        <div className="landing-topbar__actions">
          <label className="theme-switch">
            <span className="sr-only">Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label="Language">
              <option value="zh">中文</option>
              <option value="ms">BM</option>
              <option value="en">EN</option>
            </select>
          </label>
          <Link to="/auth/login" className="link-action">
            {t('action.login')}
          </Link>
          <Link to="/auth/register" className="btn btn--ghost">
            {t('action.register')}
          </Link>
        </div>
      </header>

      <main className="landing-grid">
        <section className="hero-copy">
          <div className="eyebrow">金融信息平台</div>
          <h1>{t('landing.title')}</h1>
          <p>{t('landing.claim')}</p>

          <div className="hero-actions">
            <Link to="/auth/register" className="btn btn--primary">
              {t('action.register')} <ArrowRight size={16} />
            </Link>
            <Link to="/auth/login" className="btn btn--ghost">
              <LogIn size={16} />
              {t('action.login')}
            </Link>
            <Link to="/auth/login" className="btn btn--ghost">{t('landing.demo')}</Link>
          </div>

          <figure className="media-hero media-hero--compact">
            <img src="/assets/trading-workstation-hero.png" alt="AD88 trading workstation preview" />
          </figure>

          <div className="hero-markers">
            {brandMarkers.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="marker-block">
                  <Icon size={18} />
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="hero-preview">
          <div className="preview-shell">
            <div className="preview-shell__head">
              <div>
                <span className="preview-shell__label">{t('landing.preview')}</span>
                <strong>行情与账户同步视图</strong>
              </div>
              {selected ? <StatusPill tone={selected.change24h >= 0 ? 'success' : 'critical'}>{formatPercent(selected.change24h)}</StatusPill> : null}
            </div>

            {market.status === 'loading' ? (
              <LoadingState label="正在载入市场摘要" />
            ) : market.status === 'error' ? (
              <div className="state-block state-block--error">
                <strong>行情暂不可用</strong>
                <p>{market.error}</p>
              </div>
            ) : (
              <>
                <div className="preview-metrics">
                  <StatCard label="BTC 价格" value={formatCurrency(btc?.price ?? 0)} delta={btc ? formatPercent(btc.change24h) : undefined} />
                  <StatCard label="ETH 价格" value={formatCurrency(eth?.price ?? 0)} delta={eth ? formatPercent(eth.change24h) : undefined} />
                  <StatCard label="活跃流动性" value={formatCompact(selected?.volume24h ?? 0)} note="24h 成交量" />
                </div>

                <div className="preview-chart">
                  <Sparkline values={(market.data.candles ?? []).map((candle) => candle.close)} positive={(selected?.change24h ?? 0) >= 0} />
                </div>

                <div className="preview-list">
                  {market.data.assets.slice(0, 4).map((asset) => (
                    <div key={asset.symbol} className="preview-list__row">
                      <div>
                        <strong>{asset.symbol}</strong>
                        <span>{asset.name}</span>
                      </div>
                      <div className="preview-list__value">
                        <strong>{formatCurrency(asset.price)}</strong>
                        <span className={asset.change24h >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(asset.change24h)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <DataMeta source={market.data.source} />
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-trustbar">
        <div>
          <span className="status-dot status-dot--live" />
          <strong>Public market data connected</strong>
          <span>Coinbase Exchange feed</span>
        </div>
        <div>
          <strong>Sandbox by design</strong>
          <span>No live orders or fund movement in this workspace</span>
        </div>
        <div>
          <strong>Risk-first workflow</strong>
          <span>SL / TP, position controls and audit-friendly records</span>
        </div>
      </footer>
    </div>
  );
}
