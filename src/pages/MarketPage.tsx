import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Ban, CheckCircle2, ChevronDown, ChevronUp, Clock3, Crosshair, Database, Gauge, Minus, Plus, RefreshCw, Ruler, Settings2, Trash2, Undo2, Wifi } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CandleChart, DepthChart } from '@/components/Charts';
import type { ChartDrawing } from '@/components/Charts';
import { DataMeta, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { MarketTicker } from '@/components/MarketTicker';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { formatCurrency, formatPercent, formatCompact, formatNumber, formatDateTime } from '@/lib/format';
import { useIndicativeQuotePulse, useLiveTickers } from '@/lib/useLiveTicker';
import { readStorage, writeStorage } from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { getExecutionQuote, getMarketProduct } from '@/data/assets';
import { marketFilters } from '@/data/navigation';
import { apiFetch } from '@/lib/api';
import { ensureCreditAccount, readCreditAccounts, writeCreditAccounts } from '@/lib/credits';
import type { CreditAccount, PaperPosition, TimeframeCode, TradeSide } from '@/types';

const timeframes: TimeframeCode[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

function computePnl(position: PaperPosition, exitPrice: number, lots = position.remainingLots ?? position.lots) {
  const units = lots * position.contractSize;
  return position.side === 'long'
    ? (exitPrice - position.entryPrice) * units
    : (position.entryPrice - exitPrice) * units;
}

function AssetLogo({ symbol, size = 'md' }: { symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  const product = getMarketProduct(symbol);
  return (
    <span className={`asset-logo asset-logo--${product.tone} asset-logo--${size}`} aria-hidden="true">
      {product.mark}
    </span>
  );
}

export function MarketPage() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState('XAU');
  const [timeframe, setTimeframe] = useState<TimeframeCode>('M15');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [assetClassFilter, setAssetClassFilter] = useState<(typeof marketFilters)[number]>('全部');
  const [showAllInstruments, setShowAllInstruments] = useState(false);
  const [side, setSide] = useState<TradeSide>('long');
  const [lots, setLots] = useState(0.01);
  const [contractSize, setContractSize] = useState(0.01);
  const [leverage, setLeverage] = useState(5);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>(() => readStorage('paperPositions', []));
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [partialLots, setPartialLots] = useState(0.01);
  const [editStopLoss, setEditStopLoss] = useState('');
  const [editTakeProfit, setEditTakeProfit] = useState('');
  const [chartTool, setChartTool] = useState<'cursor' | 'trendline' | 'horizontal' | 'vertical'>('cursor');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null);
  const market = useAsyncResource(() => loadMarketBundle(symbol, timeframe), [symbol, timeframe, refreshKey]);

  const refreshMarkets = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    writeStorage('paperPositions', positions);
  }, [positions]);

  useEffect(() => {
    if (!session) {
      setCreditAccount(null);
      return;
    }
    setCreditAccount(ensureCreditAccount(session).account);
  }, [session?.id]);

  const fallbackPrices = useMemo(() => {
    if (market.status !== 'success') return {};
    return Object.fromEntries(market.data.assets.map((asset) => [asset.symbol, asset.price]));
  }, [market]);
  const live = useLiveTickers(fallbackPrices);
  const userPositions = positions.filter((position) => (position.userId === session?.id || (!position.userId && session?.id)) && position.status !== 'closed');
  const watchedSymbols = useMemo(() => [symbol, ...userPositions.map((position) => position.symbol)], [symbol, userPositions]);
  const quotePulse = useIndicativeQuotePulse(watchedSymbols, fallbackPrices);
  const priceFor = (assetSymbol: string, fallback: number) => {
    const product = getMarketProduct(assetSymbol);
    return product.productId ? live.prices[assetSymbol] ?? fallback : quotePulse.prices[assetSymbol] ?? fallback;
  };
  const fallbackPrice = market.status === 'success' ? market.data.selected.price : 0;
  const livePrice = priceFor(symbol, fallbackPrice);
  const selectedUpdatedAt = getMarketProduct(symbol).productId && live.lastTickAt[symbol]
    ? new Date(live.lastTickAt[symbol]).toISOString()
    : quotePulse.quoteUpdatedAt[symbol]
      ? new Date(quotePulse.quoteUpdatedAt[symbol]).toISOString()
      : market.status === 'success' ? market.data.selected.updatedAt : new Date().toISOString();
  const selectedAsset = market.status === 'success' ? { ...market.data.selected, price: livePrice, updatedAt: selectedUpdatedAt } : null;
  const executionQuote = getExecutionQuote(symbol, livePrice);
  const spread = executionQuote.spreadBps;
  const selectedChange = selectedAsset?.change24h ?? 0;

  const rows = useMemo(() => {
    if (market.status !== 'success') return [];
    return market.data.assets.map((asset) => ({
      ...asset,
      price: priceFor(asset.symbol, asset.price),
      updatedAt: getMarketProduct(asset.symbol).productId && live.lastTickAt[asset.symbol]
        ? new Date(live.lastTickAt[asset.symbol]).toISOString()
        : quotePulse.quoteUpdatedAt[asset.symbol]
          ? new Date(quotePulse.quoteUpdatedAt[asset.symbol]).toISOString()
          : asset.updatedAt,
    }));
  }, [live.lastTickAt, live.prices, market, quotePulse.prices, quotePulse.quoteUpdatedAt]);
  const filteredRows = useMemo(() => {
    if (assetClassFilter === '全部') return rows;
    return rows.filter((asset) => asset.assetClass === assetClassFilter);
  }, [assetClassFilter, rows]);
  const visibleRows = useMemo(() => showAllInstruments ? filteredRows : filteredRows.slice(0, 10), [filteredRows, showAllInstruments]);

  const units = lots * contractSize;
  const orderPreviewPrice = side === 'long' ? executionQuote.ask : executionQuote.bid;
  const notional = units * orderPreviewPrice;
  const margin = leverage ? notional / leverage : notional;
  const availableMargin = creditAccount?.available ?? 0;
  const hasAssetMargin = availableMargin >= margin;
  const maxLots = orderPreviewPrice && contractSize ? (availableMargin * leverage) / (orderPreviewPrice * contractSize) : 0;
  const canOpen = Boolean(session) && hasAssetMargin && margin > 0 && lots >= 0.01 && contractSize > 0 && leverage > 0;
  const livePositions = userPositions.map((position) => {
    const referencePrice = priceFor(position.symbol, position.markPrice);
    const quote = getExecutionQuote(position.symbol, referencePrice);
    return { ...position, markPrice: position.side === 'long' ? quote.bid : quote.ask };
  });
  const totalPnl = livePositions.reduce((sum, position) => sum + computePnl(position, position.markPrice), 0);
  const selectedPosition = livePositions.find((position) => position.id === selectedPositionId) ?? livePositions[0];

  useEffect(() => {
    if (!selectedPosition) {
      setSelectedPositionId('');
      return;
    }
    if (!selectedPositionId) {
      setSelectedPositionId(selectedPosition.id);
    }
    setEditStopLoss(selectedPosition.stopLoss ? String(selectedPosition.stopLoss) : '');
    setEditTakeProfit(selectedPosition.takeProfit ? String(selectedPosition.takeProfit) : '');
    setPartialLots(Math.min(0.01, selectedPosition.remainingLots ?? selectedPosition.lots));
  }, [selectedPosition?.id]);

  useEffect(() => {
    if (market.status === 'success') setRefreshing(false);
  }, [market.status, market.status === 'success' ? market.data.source.updatedAt : '']);

  const sellPrice = executionQuote.bid;
  const buyPrice = executionQuote.ask;

  const auditTrade = (event: { positionId: string; symbol: string; side: TradeSide; action: 'open' | 'close' | 'partial-close' | 'risk-update'; lots: number; price: number; contractSize?: number; leverage?: number; margin?: number }) => {
    void apiFetch('/api/trades', { method: 'POST', body: JSON.stringify(event) }).catch(() => undefined);
  };

  const reserveMargin = (amount: number) => {
    if (!session) return false;
    const accounts = readCreditAccounts();
    const current = accounts.find((item) => item.userId === session.id || item.email.toLowerCase() === session.email.toLowerCase());
    if (!current || current.available < amount) return false;
    const next = { ...current, available: Number((current.available - amount).toFixed(2)), updatedAt: new Date().toISOString() };
    writeCreditAccounts(accounts.map((item) => item.userId === current.userId ? next : item));
    setCreditAccount(next);
    return true;
  };

  const settlePaperTrade = (amount: number, pnl = 0) => {
    if (!session || amount <= 0) return;
    const accounts = readCreditAccounts();
    const current = accounts.find((item) => item.userId === session.id || item.email.toLowerCase() === session.email.toLowerCase());
    if (!current) return;
    const next = {
      ...current,
      balance: Number((current.balance + pnl).toFixed(2)),
      available: Number((current.available + amount + pnl).toFixed(2)),
      updatedAt: new Date().toISOString(),
    };
    writeCreditAccounts(accounts.map((item) => item.userId === current.userId ? next : item));
    setCreditAccount(next);
  };

  const openPosition = (orderSide: TradeSide = side, orderPrice = orderPreviewPrice) => {
    const orderNotional = lots * contractSize * orderPrice;
    const orderMargin = leverage ? orderNotional / leverage : orderNotional;
    if (!canOpen || !orderPrice || !reserveMargin(orderMargin)) return;
    const positionId = crypto.randomUUID();
    const next: PaperPosition = {
      id: positionId,
      userId: session?.id,
      userName: session?.name,
      symbol,
      side: orderSide,
      lots,
      contractSize,
      leverage,
      entryPrice: orderPrice,
      markPrice: orderPrice,
      notional: orderNotional,
      margin: orderMargin,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
      openedAt: new Date().toISOString(),
      remainingLots: lots,
      closedLots: 0,
      status: 'open',
    };
    setPositions((current) => [next, ...current]);
    setSelectedPositionId(next.id);
    auditTrade({ positionId, symbol, side: orderSide, action: 'open', lots, price: orderPrice, contractSize, leverage, margin: orderMargin });
  };

  useEffect(() => {
    setDrawings([]);
    setChartTool('cursor');
  }, [symbol]);

  const closePosition = (id: string) => {
    const position = userPositions.find((item) => item.id === id);
    if (position) {
      const closeLots = position.remainingLots ?? position.lots;
      settlePaperTrade(position.margin * (closeLots / position.lots), computePnl(position, position.markPrice, closeLots));
      auditTrade({ positionId: id, symbol: position.symbol, side: position.side, action: 'close', lots: position.remainingLots ?? position.lots, price: position.markPrice, contractSize: position.contractSize, leverage: position.leverage, margin: position.margin });
    }
    setPositions((current) =>
      current.map((position) =>
        position.id === id
          ? { ...position, remainingLots: 0, closedLots: position.lots, status: 'closed', closedAt: new Date().toISOString() }
          : position,
      ),
    );
  };

  const closeAllPositions = () => {
    userPositions.forEach((position) => {
      const closeLots = position.remainingLots ?? position.lots;
      settlePaperTrade(position.margin * (closeLots / position.lots), computePnl(position, position.markPrice, closeLots));
      auditTrade({ positionId: position.id, symbol: position.symbol, side: position.side, action: 'close', lots: position.remainingLots ?? position.lots, price: position.markPrice, contractSize: position.contractSize, leverage: position.leverage, margin: position.margin });
    });
    setPositions((current) =>
      current.map((position) =>
        userPositions.some((item) => item.id === position.id)
          ? { ...position, remainingLots: 0, closedLots: position.lots, status: 'closed', closedAt: new Date().toISOString() }
          : position,
      ),
    );
    setSelectedPositionId('');
  };

  const closePartialPosition = (id: string) => {
    const position = userPositions.find((item) => item.id === id);
    if (!position) return;
    const remaining = position.remainingLots ?? position.lots;
    const closeLots = Math.min(Math.max(partialLots, 0.01), remaining);
    settlePaperTrade(position.margin * (closeLots / position.lots), computePnl(position, position.markPrice, closeLots));
    auditTrade({ positionId: id, symbol: position.symbol, side: position.side, action: closeLots >= remaining ? 'close' : 'partial-close', lots: closeLots, price: position.markPrice, contractSize: position.contractSize, leverage: position.leverage, margin: position.margin });
    setPositions((current) =>
      current.map((position) => {
        if (position.id !== id) return position;
        const currentRemaining = position.remainingLots ?? position.lots;
        const currentCloseLots = Math.min(Math.max(partialLots, 0.01), currentRemaining);
        const nextRemaining = Math.max(0, Number((currentRemaining - currentCloseLots).toFixed(2)));
        const nextClosed = Number(((position.closedLots ?? 0) + currentCloseLots).toFixed(2));
        return {
          ...position,
          remainingLots: nextRemaining,
          closedLots: nextClosed,
          status: nextRemaining > 0 ? 'partial' : 'closed',
          closedAt: nextRemaining > 0 ? position.closedAt : new Date().toISOString(),
        };
      }),
    );
  };

  const saveRiskSettings = (id: string) => {
    const position = userPositions.find((item) => item.id === id);
    if (position) {
      auditTrade({ positionId: id, symbol: position.symbol, side: position.side, action: 'risk-update', lots: position.remainingLots ?? position.lots, price: position.markPrice, contractSize: position.contractSize, leverage: position.leverage, margin: position.margin });
    }
    setPositions((current) =>
      current.map((position) =>
        position.id === id
          ? {
              ...position,
              stopLoss: editStopLoss ? Number(editStopLoss) : undefined,
              takeProfit: editTakeProfit ? Number(editTakeProfit) : undefined,
            }
          : position,
      ),
    );
  };

  if (market.status === 'loading') {
    return <LoadingState label="正在载入行情" />;
  }

  if (market.status === 'error') {
    return <div className="state-block state-block--error"><strong>行情读取失败</strong><p>{market.error}</p><button type="button" className="btn btn--ghost" onClick={refreshMarkets}><RefreshCw size={15} />重新连接数据源</button></div>;
  }

  const selectedIsCrypto = selectedAsset?.assetClass === 'crypto';
  const selectedFeedState = selectedIsCrypto && live.lastTickAt[symbol]
    ? live.status
    : quotePulse.status === 'fresh' ? 'http-fresh' : quotePulse.status === 'polling' ? 'polling' : quotePulse.status === 'stale' ? 'stale' : market.data.source.cacheState;
  const liveTone = selectedFeedState === 'live' || selectedFeedState === 'http-fresh' ? 'success' : selectedFeedState === 'stale' || selectedFeedState === 'offline' ? 'critical' : 'warning';
  const liveLabel = selectedFeedState === 'live' ? '实时订阅' : selectedFeedState === 'http-fresh' ? '每秒检查' : selectedFeedState === 'polling' ? '更新中' : selectedFeedState === 'cached' ? '缓存' : selectedFeedState === 'stale' ? '延迟' : selectedFeedState === 'offline' ? '离线' : '连接中';
  const endpointLabel = market.data.source.endpoint === '/api/market' ? '同源行情代理' : selectedIsCrypto ? 'Coinbase 公共订阅' : '公共行情 API';
  const quoteCheckAt = selectedIsCrypto ? live.lastTickAt[symbol] : quotePulse.lastCheckedAt[symbol];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Markets"
        title={t('nav.market')}
        description={t('market.description')}
        meta={<DataMeta source={market.data.source} />}
        actions={
          <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshMarkets} disabled={refreshing}>
            <RefreshCw size={16} />
            {refreshing ? '正在同步…' : t('action.refresh')}
          </button>
        }
      />

      <MarketTicker assets={rows} />

      <section className="market-data-plane" aria-label="行情数据连接状态">
        <div className="market-data-plane__identity">
          <span className={`market-data-plane__signal market-data-plane__signal--${liveTone}`}><Activity size={18} /></span>
          <div>
            <span className="eyebrow">Data plane</span>
            <h2>行情数据链路</h2>
            <p>公开市场数据经统一报价层进入行情、图表、执行价格与持仓估值。</p>
          </div>
        </div>
        <div className="market-data-plane__grid">
          <div className="market-data-plane__metric"><span><Wifi size={13} />连接健康</span><strong><StatusPill tone={liveTone}>{liveLabel}</StatusPill></strong><small>{selectedIsCrypto ? 'Exchange WebSocket ticker' : '1 秒报价检查 · 公开数据源'}</small></div>
          <div className="market-data-plane__metric"><span><Database size={13} />数据源</span><strong>{market.data.source.provider}</strong><small>{endpointLabel} · {market.data.source.mode === 'mock' ? '回退数据' : 'API adapter'}</small></div>
          <div className="market-data-plane__metric"><span><Clock3 size={13} />报价时间</span><strong>{formatDateTime(selectedAsset?.updatedAt ?? market.data.source.updatedAt)}</strong><small>最近检查 {quoteCheckAt ? formatDateTime(new Date(quoteCheckAt).toISOString()) : '等待首笔'} · 缓存 {market.data.source.cacheState}</small></div>
          <div className="market-data-plane__metric"><span><Gauge size={13} />执行模型</span><strong>{refreshing ? '同步中…' : '双边报价'} <CheckCircle2 size={14} /></strong><small>透明点差 {executionQuote.spread.toFixed(executionQuote.decimals)} · bid/ask → 仓位估值</small></div>
        </div>
      </section>

      <section className="metric-grid metric-grid--compact">
        <StatCard label={`${selectedAsset?.symbol ?? 'BTC'} ${t('market.price')}`} value={formatCurrency(livePrice)} delta={formatPercent(selectedChange)} />
        <StatCard label={t('market.change24h')} value={formatPercent(selectedChange)} note={`${selectedAsset?.name ?? ''}`} />
        <StatCard label={t('market.volume24h')} value={formatCompact(selectedAsset?.volume24h ?? 0)} note="USD" />
        <StatCard label="可用保证金" value={formatCurrency(availableMargin)} note="可用 U 额度" />
      </section>

      <section className="content-grid content-grid--two market-workbench">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('market.assets')}</h2>
              <p>{t('market.assetsHint')}</p>
            </div>
            <StatusPill tone={liveTone}>{liveLabel}</StatusPill>
          </div>
          <div className="asset-selector">
            <div className="market-filter-row">
              {marketFilters.map((filter) => (
                <button key={filter} type="button" className={`chip ${assetClassFilter === filter ? 'is-active' : ''}`} onClick={() => { setAssetClassFilter(filter); setShowAllInstruments(false); }}>
                  {filter === '全部' ? '全部资产' : filter === 'crypto' ? '加密' : filter === 'commodity' ? '商品' : filter === 'forex' ? '外汇' : filter === 'equity' ? '股票' : '指数'}
                </button>
              ))}
            </div>
            {visibleRows.map((asset) => (
              <button key={asset.symbol} type="button" className={`asset-selector__chip ${asset.symbol === symbol ? 'is-active' : ''}`} onClick={() => setSymbol(asset.symbol)}>
                <AssetLogo symbol={asset.symbol} size="sm" />
                {asset.symbol}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>{t('market.asset')}</th>
                  <th className="text-end">{t('market.price')}</th>
                  <th className="text-end">{t('market.change')}</th>
                  <th className="text-end">{t('market.volume')}</th>
                  <th className="text-end">{t('market.spread')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((asset) => (
                  <tr key={asset.symbol} className={asset.symbol === symbol ? 'is-selected' : ''} onClick={() => setSymbol(asset.symbol)}>
                    <td>
                      <div className="asset-cell">
                        <AssetLogo symbol={asset.symbol} />
                        <div>
                          <strong>{asset.symbol}</strong>
                          <div className="text-small text-muted">{asset.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`text-end price-cell price-cell--${live.directions[asset.symbol] ?? 'flat'}`}>{formatCurrency(asset.price)}</td>
                    <td className="text-end">
                      <span className={asset.change24h >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(asset.change24h)}</span>
                    </td>
                    <td className="text-end">{formatCompact(asset.volume24h)}</td>
                    <td className="text-end">{asset.spreadBps.toFixed(2)} bps</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 10 ? (
            <div className="instrument-disclosure">
              <div>
                <strong>{showAllInstruments ? `已显示 ${filteredRows.length} 个品种` : '首屏保留 10 个重点品种'}</strong>
                <span>{showAllInstruments ? '可从上方筛选缩小范围。' : `另有 ${filteredRows.length - 10} 个品种可交易或关注。`}</span>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAllInstruments((value) => !value)}>
                {showAllInstruments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAllInstruments ? '收起品种' : '显示更多品种'}
              </button>
            </div>
          ) : null}
        </article>

        <article className="panel market-chart-panel market-chart-panel--pro">
          <div className="panel__head">
            <div>
              <h2>{selectedAsset?.symbol} {t('market.chart')}</h2>
              <p>{t('market.updated')} {formatDateTime(selectedAsset?.updatedAt ?? market.data.source.updatedAt)}</p>
            </div>
            <StatusPill tone={selectedChange >= 0 ? 'success' : 'critical'}>{formatPercent(selectedChange)}</StatusPill>
          </div>
          <div className="instrument-banner">
            <AssetLogo symbol={selectedAsset?.symbol ?? symbol} size="lg" />
            <div className="instrument-banner__copy">
              <span className="eyebrow">Selected instrument</span>
              <strong>{selectedAsset?.name ?? symbol}</strong>
              <span>实时参考价 · {selectedAsset?.assetClass ?? 'market'}</span>
            </div>
            <div className="instrument-banner__quote">
              <strong>{formatNumber(livePrice)}</strong>
              <span className={selectedChange >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(selectedChange)}</span>
            </div>
          </div>
          <div className="trading-chart__toolbar" aria-label="图表工具">
            <span className="chart-toolbar__label">图表工具</span>
            <button type="button" className={`chart-tool ${chartTool === 'cursor' ? 'is-active' : ''}`} onClick={() => setChartTool('cursor')} title="选择"><Crosshair size={15} />选择</button>
            <button type="button" className={`chart-tool ${chartTool === 'trendline' ? 'is-active' : ''}`} onClick={() => setChartTool('trendline')} title="趋势线"><Ruler size={15} />趋势线</button>
            <button type="button" className={`chart-tool ${chartTool === 'horizontal' ? 'is-active' : ''}`} onClick={() => setChartTool('horizontal')} title="水平线"><Minus size={15} />水平线</button>
            <button type="button" className={`chart-tool ${chartTool === 'vertical' ? 'is-active' : ''}`} onClick={() => setChartTool('vertical')} title="垂直线"><Plus size={15} />垂直线</button>
            <button type="button" className="chart-tool" onClick={() => setDrawings([])} title="清除画线"><Undo2 size={15} />清除</button>
          </div>
          <div className="timeframe-row">
            {timeframes.map((item) => (
              <button key={item} type="button" className={`timeframe-button ${timeframe === item ? 'is-active' : ''}`} onClick={() => setTimeframe(item)}>
                {item}
              </button>
            ))}
          </div>
          <CandleChart candles={market.data.candles} drawTool={chartTool} drawings={drawings} onAddDrawing={(drawing) => setDrawings((current) => [...current, drawing])} />
          <div className="execution-bar">
            <button type="button" className="execution-quote execution-quote--sell" onClick={() => openPosition('short', sellPrice)} disabled={!canOpen}>
              <span>SELL · BID</span><strong>{formatNumber(sellPrice)}</strong><small>做空</small>
            </button>
            <div className="execution-bar__middle">
              <span className="execution-bar__label">参考中间价</span>
              <strong>{formatNumber(livePrice)}</strong>
              <label><span>开仓手数</span><input type="number" min="0.01" step="0.01" value={lots} onChange={(event) => setLots(Math.max(0.01, Number(event.target.value) || 0.01))} /></label>
              <small>点差 {executionQuote.spread.toFixed(executionQuote.decimals)}</small>
            </div>
            <button type="button" className="execution-quote execution-quote--buy" onClick={() => openPosition('long', buyPrice)} disabled={!canOpen}>
              <span>BUY · ASK</span><strong>{formatNumber(buyPrice)}</strong><small>做多</small>
            </button>
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel trade-ticket">
          <div className="panel__head">
            <div>
              <h2>{t('market.orderTicket')}</h2>
              <p>{t('market.orderHint')}</p>
            </div>
            <StatusPill tone={canOpen ? 'success' : 'warning'}>{canOpen ? t('market.canOpen') : !session ? '请先登录' : !hasAssetMargin ? '该资产保证金不足' : t('market.marginWarning')}</StatusPill>
          </div>

          <div className="trade-side-control">
            <button type="button" className={side === 'long' ? 'is-active trade-side-control__long' : ''} onClick={() => setSide('long')}>
              <ArrowUpRight size={16} />
              {t('market.long')}
            </button>
            <button type="button" className={side === 'short' ? 'is-active trade-side-control__short' : ''} onClick={() => setSide('short')}>
              <ArrowDownRight size={16} />
              {t('market.short')}
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t('market.lots')}</span>
              <input type="number" min="0.01" step="0.01" value={lots} onChange={(event) => setLots(Math.max(0.01, Number(event.target.value) || 0.01))} />
            </label>
            <label className="field">
              <span>{t('market.contractSize')}</span>
              <input type="number" min="0.0001" step="0.001" value={contractSize} onChange={(event) => setContractSize(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t('market.leverage')}</span>
              <input type="number" min="1" max="50" step="1" value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t('market.maxLots')}</span>
              <input value={formatNumber(maxLots)} readOnly />
            </label>
            <label className="field">
              <span>{t('market.stopLoss')}</span>
              <input type="number" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} />
            </label>
            <label className="field">
              <span>{t('market.takeProfit')}</span>
              <input type="number" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} />
            </label>
          </div>

          <div className="risk-strip">
            <div><span>{t('market.notional')}</span><strong>{formatCurrency(notional)}</strong></div>
            <div><span>此资产保证金</span><strong>{formatCurrency(margin)}</strong></div>
            <div><span>{t('market.units')}</span><strong>{formatNumber(units)}</strong></div>
          </div>

          <button type="button" className="btn btn--primary btn--block" onClick={() => openPosition()} disabled={!canOpen}>
            {t('market.placeSandboxOrder')}
          </button>
          <div className="risk-note">
            <AlertTriangle size={16} />
            {!session ? '登录后可按账户可用 U 额度开仓。' : !hasAssetMargin ? `当前账号可用保证金 ${formatCurrency(availableMargin)}，低于 ${symbol} 所需的 ${formatCurrency(margin)}。` : t('market.paperOnly')}
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('market.positions')}</h2>
              <p>每秒按最新可执行平仓价重估。做多按 bid，做空按 ask。</p>
            </div>
            <div className="panel__actions">
              <StatusPill tone={totalPnl >= 0 ? 'success' : 'critical'}>{formatCurrency(totalPnl)}</StatusPill>
              {livePositions.length ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={closeAllPositions}>
                  <Ban size={14} />
                  一键关闭
                </button>
              ) : null}
            </div>
          </div>
          {livePositions.length ? (
            <div className="position-console">
              <div className="stack-list">
                {livePositions.map((position) => {
                  const pnl = computePnl(position, position.markPrice);
                  const remaining = position.remainingLots ?? position.lots;
                  return (
                    <div
                      key={position.id}
                      className={`position-row position-row--button ${selectedPosition?.id === position.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedPositionId(position.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedPositionId(position.id);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedPosition?.id === position.id}
                    >
                      <div>
                        <strong>
                          <AssetLogo symbol={position.symbol} size="sm" />
                          {position.symbol}
                          <span className={`side-badge side-badge--${position.side}`}>{position.side === 'long' ? '做多' : '做空'}</span>
                        </strong>
                        <span>{t('market.entry')} {formatCurrency(position.entryPrice)} / 可平仓价 {formatCurrency(position.markPrice)}</span>
                        <span>剩余 {remaining.toFixed(2)} / 已平 {Number(position.closedLots ?? 0).toFixed(2)} lots</span>
                      </div>
                      <div className="position-row__meta">
                        <StatusPill tone={pnl >= 0 ? 'success' : 'critical'}>{formatCurrency(pnl)}</StatusPill>
                        <span>{formatDateTime(position.openedAt)}</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            closePosition(position.id);
                          }}
                        >
                          关闭此单
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedPosition ? (
                <div className="position-editor">
                  <div className="panel__head">
                    <div>
                      <h2><Settings2 size={16} /> {selectedPosition.symbol} 仓位设置</h2>
                      <p>可修改 SL/TP，也可以按 0.01 lots 分批关闭。</p>
                    </div>
                    <StatusPill tone={selectedPosition.side === 'long' ? 'success' : 'critical'}>
                      {selectedPosition.side === 'long' ? '做多' : '做空'}
                    </StatusPill>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Stop Loss</span>
                      <input type="number" value={editStopLoss} onChange={(event) => setEditStopLoss(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Take Profit</span>
                      <input type="number" value={editTakeProfit} onChange={(event) => setEditTakeProfit(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>分批关闭 lots</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={selectedPosition.remainingLots ?? selectedPosition.lots}
                        value={partialLots}
                        onChange={(event) => setPartialLots(Number(event.target.value))}
                      />
                    </label>
                    <label className="field">
                      <span>剩余手数</span>
                      <input value={Number(selectedPosition.remainingLots ?? selectedPosition.lots).toFixed(2)} readOnly />
                    </label>
                  </div>
                  <div className="position-editor__actions">
                    <button type="button" className="btn btn--ghost" onClick={() => saveRiskSettings(selectedPosition.id)}>
                      保存 SL / TP
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => closePartialPosition(selectedPosition.id)}>
                      关闭 {partialLots.toFixed(2)}
                    </button>
                    <button type="button" className="btn btn--primary" onClick={() => closePosition(selectedPosition.id)}>
                      <Trash2 size={16} />
                      关闭整笔
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="state-block">
              <strong>{t('market.noPositions')}</strong>
              <p>{t('market.noPositionsHint')}</p>
            </div>
          )}
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('market.depth')}</h2>
              <p>{t('market.depthHint')}</p>
            </div>
          </div>
          <DepthChart bids={market.data.depth.bids} asks={market.data.depth.asks} />
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('market.orderBook')}</h2>
              <p>{t('market.orderBookHint')}</p>
            </div>
          </div>
          <div className="book-grid">
            <div className="book-grid__side">
              <strong>{t('market.asks')}</strong>
              {market.data.orderBook.asks.slice().reverse().map((level) => (
                <div key={`${level.price}-${level.side}`} className="book-row book-row--ask">
                  <span>{formatNumber(level.price)}</span>
                  <span>{formatNumber(level.size)}</span>
                  <span>{formatNumber(level.depth)}</span>
                </div>
              ))}
            </div>
            <div className="book-grid__side">
              <strong>{t('market.bids')}</strong>
              {market.data.orderBook.bids.map((level) => (
                <div key={`${level.price}-${level.side}`} className="book-row book-row--bid">
                  <span>{formatNumber(level.price)}</span>
                  <span>{formatNumber(level.size)}</span>
                  <span>{formatNumber(level.depth)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="inline-meta">
            <span>{t('market.source')} {market.data.source.provider}</span>
            <span>{t('market.updated')} {formatDateTime(market.data.source.updatedAt)}</span>
            <span>{t('market.cache')} {market.data.source.cacheState}</span>
            <span>点差 {executionQuote.spread.toFixed(executionQuote.decimals)} ({spread.toFixed(2)} bps)</span>
          </div>
        </article>
      </section>
    </div>
  );
}
