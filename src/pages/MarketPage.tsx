import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Ban, CheckCircle2, ChevronDown, ChevronUp, Crosshair, Minus, Plus, RefreshCw, Ruler, Settings2, Trash2, Undo2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CandleChart } from '@/components/Charts';
import { TimedScenarioWorkspace } from '@/components/TimedScenarioWorkspace';
import type { ChartDrawing } from '@/components/Charts';
import { DataMeta, LoadingState, StatCard, StatusPill } from '@/components/Stats';
import { MarketTicker } from '@/components/MarketTicker';
import { useAsyncResource } from '@/lib/useAsyncResource';
import { loadMarketBundle } from '@/adapters/market-adapter';
import { formatCurrency, formatPercent, formatCompact, formatMarketCurrency, formatMarketPrice, formatNumber, formatDateTime } from '@/lib/format';
import { useIndicativeQuotePulse, useLiveTickers } from '@/lib/useLiveTicker';
import { writeStorage } from '@/lib/storage';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { assetClassKey, assetNameKey, getExecutionQuote, getMarketArtworkPriority, getMarketIcon, getMarketProduct, getMarketVisual, getTradeSpec, marketProducts } from '@/data/assets';
import { marketFilters } from '@/data/navigation';
import { apiFetch } from '@/lib/api';
import { loadRemoteCreditAccount, readCreditAccounts, writeCreditAccounts } from '@/lib/credits';
import type { CreditAccount, PaperPosition, TimeframeCode, TradeSide } from '@/types';

const timeframes: TimeframeCode[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

type PaperWorkspaceResponse = {
  positions: PaperPosition[];
  creditAccount: CreditAccount;
  position?: PaperPosition;
};

function computePnl(position: PaperPosition, exitPrice: number, lots = position.remainingLots ?? position.lots) {
  const units = lots * position.contractSize;
  return position.side === 'long'
    ? (exitPrice - position.entryPrice) * units
    : (position.entryPrice - exitPrice) * units;
}

function AssetLogo({ symbol, size = 'md' }: { symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  const product = getMarketProduct(symbol);
  const icon = getMarketIcon(symbol);
  return (
    <span className={`asset-logo asset-logo--${product.tone} asset-logo--${size} ${icon ? 'asset-logo--image' : ''}`} aria-hidden="true">
      {icon ? <img className="asset-logo__image" src={icon} alt="" decoding="async" /> : product.mark}
    </span>
  );
}

function InstrumentArtwork({ symbol }: { symbol: string }) {
  const image = getMarketVisual(symbol);
  const product = getMarketProduct(symbol);
  if (!image) {
    return (
      <div className={`instrument-banner__art instrument-banner__art--fallback instrument-banner__art--${product.tone}`} aria-hidden="true">
        <span className="instrument-banner__fallback-grid" />
        <span className="instrument-banner__fallback-orbit" />
        <span className="instrument-banner__art-mark"><AssetLogo symbol={symbol} size="lg" /></span>
      </div>
    );
  }
  return (
    <div className="instrument-banner__art" aria-hidden="true">
      <img src={image} alt="" decoding="async" />
      <span className="instrument-banner__art-mark"><AssetLogo symbol={symbol} size="sm" /></span>
    </div>
  );
}

export function MarketPage() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState('XAU');
  const [timeframe, setTimeframe] = useState<TimeframeCode>('M15');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [assetClassFilter, setAssetClassFilter] = useState<(typeof marketFilters)[number]>('All');
  const [showAllInstruments, setShowAllInstruments] = useState(false);
  const [side, setSide] = useState<TradeSide>('long');
  const initialTradeSpec = getTradeSpec('XAU');
  const [lots, setLots] = useState(initialTradeSpec.minimumLots);
  const [lotsInput, setLotsInput] = useState(String(initialTradeSpec.minimumLots));
  const [contractSize, setContractSize] = useState(initialTradeSpec.contractSize);
  const [leverage, setLeverage] = useState(initialTradeSpec.defaultLeverage);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [partialLots, setPartialLots] = useState(0.01);
  const [editStopLoss, setEditStopLoss] = useState('');
  const [editTakeProfit, setEditTakeProfit] = useState('');
  const [chartTool, setChartTool] = useState<'cursor' | 'trendline' | 'horizontal' | 'vertical'>('cursor');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const market = useAsyncResource(() => loadMarketBundle(symbol, timeframe), [symbol, timeframe, refreshKey]);

  // Command Center market links carry a normalized symbol. Respect it once it
  // reaches the trade workspace, while still rejecting arbitrary query input.
  const requestedSymbol = searchParams.get('symbol')?.trim().toUpperCase();
  useEffect(() => {
    if (requestedSymbol && marketProducts.some((product) => product.symbol === requestedSymbol)) {
      setSymbol(requestedSymbol);
    }
  }, [requestedSymbol]);

  useEffect(() => {
    // Each instrument carries its own standard-lot definition. Resetting the
    // paper ticket on symbol change prevents BTC's 1-unit contract or XAU's
    // 100-ounce contract from inheriting the previous product's math.
    const spec = getTradeSpec(symbol);
    setContractSize(spec.contractSize);
    setLeverage(spec.defaultLeverage);
    setLots((current) => Math.max(spec.minimumLots, current));
    setLotsInput((current) => {
      const parsed = Number(current);
      return String(Math.max(spec.minimumLots, Number.isFinite(parsed) && parsed > 0 ? parsed : spec.minimumLots));
    });
  }, [symbol]);

  const updateLots = (value: string) => {
    setLotsInput(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= tradeSpec.minimumLots) setLots(parsed);
  };

  const refreshMarkets = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (!session?.id) {
      setPositions([]);
      setCreditAccount(null);
      return;
    }
    let active = true;
    const refreshWorkspace = async () => {
      try {
        const [remotePositions, account] = await Promise.all([
          apiFetch<PaperPosition[]>('/api/paper/positions'),
          loadRemoteCreditAccount(session),
        ]);
        if (!active) return;
        setPositions(remotePositions);
        writeStorage('paperPositions', remotePositions, { sync: false, notify: false });
        setCreditAccount(account);
      } catch {
        // Do not replace a rendered position state with a browser-generated
        // fallback. The server remains the source of truth for paper orders.
      }
    };
    void refreshWorkspace();
    const timer = window.setInterval(() => void refreshWorkspace(), 8_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session?.id]);

  const fallbackPrices = useMemo(() => {
    if (market.status !== 'success') return {};
    return Object.fromEntries(market.data.assets.map((asset) => [asset.symbol, asset.price]));
  }, [market]);
  // `useAsyncResource` deliberately preserves the surrounding workspace
  // while a new instrument loads. Resolve the selected product from the
  // already-normalized asset list so BTC never briefly inherits XAU's title,
  // image or instrument class during that background request.
  const selectedBaseAsset = market.status === 'success'
    ? market.data.assets.find((asset) => asset.symbol === symbol) ?? market.data.selected
    : null;
  const chartIsRefreshingForSymbol = market.status === 'success' && market.data.selected.symbol !== symbol;
  const live = useLiveTickers(fallbackPrices);
  // Include the legacy email-shaped id only while old browser snapshots are
  // being migrated. New positions always use the server-issued account id.
  const userPositions = positions.filter((position) => (position.userId === session?.id || position.userId === session?.email) && position.status !== 'closed');
  const quotePulse = useIndicativeQuotePulse(marketProducts.map((product) => product.symbol), fallbackPrices);
  const displayPriceFor = (assetSymbol: string, fallback: number) => {
    const product = getMarketProduct(assetSymbol);
    return product.productId
      ? live.prices[assetSymbol] ?? fallback
      : quotePulse.displayPrices[assetSymbol] ?? quotePulse.prices[assetSymbol] ?? fallback;
  };
  // Keep the authority path separate from the visual cadence. The server
  // recomputes the final paper quote too, but this raw value keeps the client
  // preview and PnL honest when a quiet non-crypto row is visually pulsing.
  const authoritativePriceFor = (assetSymbol: string, fallback: number) => {
    const product = getMarketProduct(assetSymbol);
    return product.productId
      ? live.prices[assetSymbol] ?? quotePulse.prices[assetSymbol] ?? fallback
      : quotePulse.prices[assetSymbol] ?? fallback;
  };
  const fallbackPrice = selectedBaseAsset?.price ?? 0;
  const livePrice = displayPriceFor(symbol, fallbackPrice);
  const authoritativePrice = authoritativePriceFor(symbol, fallbackPrice);
  const selectedUpdatedAt = getMarketProduct(symbol).productId && live.lastTickAt[symbol]
    ? new Date(live.lastTickAt[symbol]).toISOString()
    : quotePulse.quoteUpdatedAt[symbol]
      ? new Date(quotePulse.quoteUpdatedAt[symbol]).toISOString()
      : selectedBaseAsset?.updatedAt ?? new Date().toISOString();
  const selectedAsset = selectedBaseAsset ? {
    ...selectedBaseAsset,
    price: livePrice,
    bid: quotePulse.displayBids[symbol] ?? quotePulse.bids[symbol] ?? selectedBaseAsset.bid,
    ask: quotePulse.displayAsks[symbol] ?? quotePulse.asks[symbol] ?? selectedBaseAsset.ask,
    dataState: quotePulse.dataStates[symbol] ?? selectedBaseAsset.dataState,
    updatedAt: selectedUpdatedAt,
  } : null;
  const calculatedExecutionQuote = getExecutionQuote(symbol, authoritativePrice);
  const authoritativeBid = quotePulse.bids[symbol] ?? selectedBaseAsset?.bid;
  const authoritativeAsk = quotePulse.asks[symbol] ?? selectedBaseAsset?.ask;
  const executionQuote = authoritativeBid && authoritativeAsk && authoritativeAsk >= authoritativeBid
    ? {
        bid: authoritativeBid,
        ask: authoritativeAsk,
        spread: authoritativeAsk - authoritativeBid,
        decimals: calculatedExecutionQuote.decimals,
        spreadBps: authoritativePrice ? ((authoritativeAsk - authoritativeBid) / authoritativePrice) * 10_000 : 0,
      }
    : calculatedExecutionQuote;
  const selectedChange = quotePulse.changes[symbol] ?? selectedAsset?.change24h ?? 0;

  const rows = useMemo(() => {
    if (market.status !== 'success') return [];
    return market.data.assets.map((asset) => ({
      ...asset,
      price: displayPriceFor(asset.symbol, asset.price),
      change24h: quotePulse.changes[asset.symbol] ?? asset.change24h,
      updatedAt: getMarketProduct(asset.symbol).productId && live.lastTickAt[asset.symbol]
        ? new Date(live.lastTickAt[asset.symbol]).toISOString()
        : quotePulse.quoteUpdatedAt[asset.symbol]
          ? new Date(quotePulse.quoteUpdatedAt[asset.symbol]).toISOString()
          : asset.updatedAt,
    })).sort((left, right) => getMarketArtworkPriority(right.symbol) - getMarketArtworkPriority(left.symbol));
  }, [live.lastTickAt, live.prices, market, quotePulse.changes, quotePulse.displayPrices, quotePulse.prices, quotePulse.quoteUpdatedAt]);
  const filteredRows = useMemo(() => {
    if (assetClassFilter === 'All') return rows;
    return rows.filter((asset) => asset.assetClass === assetClassFilter);
  }, [assetClassFilter, rows]);
  const visibleRows = useMemo(() => showAllInstruments ? filteredRows : filteredRows.slice(0, 10), [filteredRows, showAllInstruments]);

  const tradeSpec = getTradeSpec(symbol);
  const units = lots * contractSize;
  const orderPreviewPrice = side === 'long' ? executionQuote.ask : executionQuote.bid;
  const notional = units * orderPreviewPrice;
  const margin = leverage ? notional / leverage : notional;
  // This is the honest paper PnL for a 1.00 move in the quoted instrument;
  // it is not a promised return and excludes spread, funding and slippage.
  const pnlForOneQuoteMove = units;
  const availableMargin = creditAccount?.available ?? 0;
  const hasAssetMargin = availableMargin >= margin;
  const maxLots = orderPreviewPrice && contractSize ? (availableMargin * leverage) / (orderPreviewPrice * contractSize) : 0;
  const canOpen = Boolean(session) && hasAssetMargin && margin > 0 && lots >= tradeSpec.minimumLots && contractSize > 0 && leverage > 0;
  const livePositions = userPositions.map((position) => {
    const referencePrice = authoritativePriceFor(position.symbol, position.markPrice);
    const indicative = getExecutionQuote(position.symbol, referencePrice);
    const bid = quotePulse.bids[position.symbol];
    const ask = quotePulse.asks[position.symbol];
    const quote = bid && ask && ask >= bid ? { ...indicative, bid, ask } : indicative;
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
    // A retained background fetch keeps `status` at success. Clear the manual
    // refresh affordance only after that fetch has actually settled, otherwise
    // the Trade workspace can appear to lose its controls mid-refresh.
    if (market.status === 'success' && !market.refreshing) setRefreshing(false);
  }, [market.status, market.status === 'success' ? market.refreshing : false, market.status === 'success' ? market.data.source.updatedAt : '']);

  const sellPrice = executionQuote.bid;
  const buyPrice = executionQuote.ask;

  const announceAction = (tone: 'success' | 'warning' | 'error', message: string) => {
    setActionFeedback({ tone, message });
  };

  const applyPaperWorkspace = (result: PaperWorkspaceResponse) => {
    const remotePositions = Array.isArray(result.positions) ? result.positions : [];
    setPositions(remotePositions);
    writeStorage('paperPositions', remotePositions, { sync: false, notify: false });
    if (!result.creditAccount) return;
    const accounts = readCreditAccounts();
    writeCreditAccounts([result.creditAccount, ...accounts.filter((item) => item.userId !== result.creditAccount.userId && item.email.toLowerCase() !== result.creditAccount.email.toLowerCase())]);
    setCreditAccount(result.creditAccount);
  };

  const openPosition = async (orderSide: TradeSide = side) => {
    if (!canOpen || busyAction) return;
    setBusyAction('open');
    try {
      const result = await apiFetch<PaperWorkspaceResponse>('/api/paper/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          side: orderSide,
          lots,
          leverage,
          stopLoss: stopLoss || undefined,
          takeProfit: takeProfit || undefined,
        }),
      });
      applyPaperWorkspace(result);
      if (result.position) setSelectedPositionId(result.position.id);
      announceAction('success', t('market.openSuccess'));
    } catch {
      announceAction('error', t('market.paperActionFailed'));
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    setDrawings([]);
    setChartTool('cursor');
  }, [symbol]);

  const closePosition = async (id: string) => {
    if (busyAction) return;
    const position = livePositions.find((item) => item.id === id);
    if (!position) {
      announceAction('error', t('market.positionActionUnavailable'));
      return;
    }
    setBusyAction(`close:${id}`);
    try {
      const result = await apiFetch<PaperWorkspaceResponse>(`/api/paper/positions/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({}) });
      applyPaperWorkspace(result);
      announceAction('success', t('market.closeSuccess'));
    } catch {
      announceAction('error', t('market.paperActionFailed'));
    } finally {
      setBusyAction(null);
    }
  };

  const closeAllPositions = async () => {
    if (busyAction || !livePositions.length) return;
    setBusyAction('close-all');
    try {
      const result = await apiFetch<PaperWorkspaceResponse>('/api/paper/positions/close-all', { method: 'POST', body: JSON.stringify({}) });
      applyPaperWorkspace(result);
      setSelectedPositionId('');
      announceAction('success', t('market.closeAllSuccess'));
    } catch {
      announceAction('error', t('market.paperActionFailed'));
    } finally {
      setBusyAction(null);
    }
  };

  const closePartialPosition = async (id: string) => {
    if (busyAction) return;
    const position = livePositions.find((item) => item.id === id);
    if (!position) {
      announceAction('error', t('market.positionActionUnavailable'));
      return;
    }
    const remaining = position.remainingLots ?? position.lots;
    const closeLots = Math.min(Math.max(Number(partialLots) || 0.01, 0.01), remaining);
    setBusyAction(`partial:${id}`);
    try {
      const result = await apiFetch<PaperWorkspaceResponse>(`/api/paper/positions/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({ lots: closeLots }) });
      applyPaperWorkspace(result);
      announceAction('success', closeLots >= remaining ? t('market.closeSuccess') : t('market.partialCloseSuccess'));
    } catch {
      announceAction('error', t('market.paperActionFailed'));
    } finally {
      setBusyAction(null);
    }
  };

  const saveRiskSettings = async (id: string) => {
    if (busyAction) return;
    setBusyAction(`risk:${id}`);
    try {
      const result = await apiFetch<PaperWorkspaceResponse>(`/api/paper/positions/${encodeURIComponent(id)}/risk`, {
        method: 'PUT',
        body: JSON.stringify({ stopLoss: editStopLoss || undefined, takeProfit: editTakeProfit || undefined }),
      });
      applyPaperWorkspace(result);
      announceAction('success', t('market.riskSaved'));
    } catch {
      announceAction('error', t('market.paperActionFailed'));
    } finally {
      setBusyAction(null);
    }
  };

  if (market.status === 'loading') {
    return <LoadingState label={t('ui.loadingWorkspace')} />;
  }

  if (market.status === 'error') {
    return <div className="state-block state-block--error"><strong>{t('ui.marketDataUnavailable')}</strong><p>{market.error}</p><button type="button" className="btn btn--ghost" onClick={refreshMarkets}><RefreshCw size={15} /> {t('ui.reconnectMarketData')}</button></div>;
  }

  const selectedIsCrypto = selectedAsset?.assetClass === 'crypto';
  const selectedFeedState = selectedAsset?.dataState ?? (selectedIsCrypto && live.lastTickAt[symbol] ? 'live' : quotePulse.dataStates[symbol] ?? (quotePulse.status === 'stale' ? 'fallback' : 'live'));
  const liveTone = selectedFeedState === 'broker' || selectedFeedState === 'live' ? 'success' : selectedFeedState === 'fallback' ? 'warning' : 'info';
  const liveLabel = selectedFeedState === 'broker' ? t('market.feedBroker') : selectedFeedState === 'cached' ? t('market.feedCache') : selectedFeedState === 'fallback' ? t('market.feedFallback') : t('market.feedLive');
  const displayMode = quotePulse.displayModes[symbol] ?? (selectedIsCrypto ? 'verified' : 'indicative');
  const displayModeLabel = displayMode === 'interpolated' ? t('market.displayInterpolated') : displayMode === 'indicative' ? t('market.displayIndicative') : t('market.displayVerified');
  const selectedDirection = quotePulse.directions[symbol] ?? 'flat';
  const lastQuoteCheck = quotePulse.lastCheckedAt[symbol];
  // A moving UI should never claim a changing market when the numeric quote
  // has not changed. Keep visual cadence on a quiet/degraded source, and only
  // animate the actual number between received server references.
  const awaitingVerifiedQuote = selectedFeedState === 'fallback' || quotePulse.status === 'polling' || quotePulse.status === 'stale';
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('market.headerEyebrow')}
        title={t('nav.market')}
        description={t('market.headerDescription')}
        actions={
          <button type="button" className={`btn btn--ghost ${refreshing ? 'is-busy' : ''}`} onClick={refreshMarkets} disabled={refreshing}>
            <RefreshCw size={16} />
            {refreshing ? t('ui.synchronizing') : t('ui.refreshWorkspace')}
          </button>
        }
      />

      <MarketTicker assets={rows} />

      <section className="market-integrity-rail">
        <DataMeta
          source={{ ...market.data.source, dataState: selectedFeedState, updatedAt: selectedUpdatedAt }}
          refreshing={refreshing || market.refreshing}
          refreshError={market.refreshError}
        />
        <span className={`market-display-mode market-display-mode--${displayMode}`} title={t('market.displayModeHint')}>{displayModeLabel}</span>
        <span className={`market-integrity-rail__stream market-integrity-rail__stream--${quotePulse.streamStatus === 'open' ? 'healthy' : 'monitoring'}`}>{quotePulse.streamStatus === 'open' ? t('market.streamConnected') : t('market.streamMonitoring')}</span>
      </section>

      {actionFeedback ? (
        <div className={`notice-banner notice-banner--${actionFeedback.tone}`} role="status" aria-live="polite">
          {actionFeedback.tone === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{actionFeedback.message}</span>
        </div>
      ) : null}

      <section className="metric-grid metric-grid--compact">
        <StatCard label={`${selectedAsset?.symbol ?? 'BTC'} ${t('market.price')}`} value={formatMarketCurrency(livePrice)} delta={formatPercent(selectedChange)} />
        <StatCard label={t('market.change24h')} value={formatPercent(selectedChange)} note={selectedAsset ? t(assetNameKey(selectedAsset.symbol)) : ''} />
        <StatCard label={t('market.volume24h')} value={formatCompact(selectedAsset?.volume24h ?? 0)} note={t('market.volumeUsd')} />
        <StatCard label={t('market.availableMargin')} value={formatCurrency(availableMargin)} note={t('market.paperBuyingPower')} />
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
            <div className={`asset-selector instrument-chip-scroll ${showAllInstruments ? 'is-expanded' : ''}`} tabIndex={showAllInstruments ? 0 : -1}>
            <div className="market-filter-row">
              {marketFilters.map((filter) => (
                <button key={filter} type="button" className={`chip ${assetClassFilter === filter ? 'is-active' : ''}`} onClick={() => { setAssetClassFilter(filter); setShowAllInstruments(false); }}>
                  {filter === 'All' ? t('market.allInstruments') : filter === 'crypto' ? t('market.crypto') : filter === 'commodity' ? t('market.commodities') : filter === 'forex' ? t('market.fx') : filter === 'equity' ? t('market.equities') : t('market.indices')}
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
          <div className={`table-wrap instrument-list-scroll ${showAllInstruments ? 'is-expanded' : ''}`} tabIndex={showAllInstruments ? 0 : -1}>
            <table className="table table--interactive">
              <thead>
                <tr>
                  <th>{t('market.asset')}</th>
                  <th className="text-end">{t('market.price')}</th>
                  <th className="text-end">{t('market.change')}</th>
                  <th className="text-end">{t('market.volume')}</th>
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
                          <div className="text-small text-muted">{t(assetNameKey(asset.symbol))}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`text-end price-cell price-cell--${quotePulse.directions[asset.symbol] ?? live.directions[asset.symbol] ?? 'flat'}`}>{formatMarketCurrency(asset.price)}</td>
                    <td className="text-end">
                      <span className={asset.change24h >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(asset.change24h)}</span>
                    </td>
                    <td className="text-end">{formatCompact(asset.volume24h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 10 ? (
            <div className="instrument-disclosure">
              <div>
                <strong>{showAllInstruments ? `${filteredRows.length}${t('market.instrumentsVisible')}` : t('market.firstView')}</strong>
                <span>{showAllInstruments ? t('market.useFilters') : `${filteredRows.length - 10}${t('market.additionalInstruments')}`}</span>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAllInstruments((value) => !value)}>
                {showAllInstruments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAllInstruments ? t('market.showFewer') : t('market.showMore')}
              </button>
            </div>
          ) : null}
        </article>

        <article className="panel market-chart-panel market-chart-panel--pro">
          <div className="panel__head">
            <div>
              <h2>{selectedAsset?.symbol} {t('market.chart')}</h2>
              <p>{timeframe} {t('market.chartSubtitle')}</p>
            </div>
            <StatusPill tone={selectedChange >= 0 ? 'success' : 'critical'}>{formatPercent(selectedChange)}</StatusPill>
          </div>
          <div key={`${symbol}-${lastQuoteCheck ?? selectedUpdatedAt}`} className={`instrument-banner instrument-banner--${selectedDirection} instrument-banner--${displayMode} ${awaitingVerifiedQuote ? 'instrument-banner--monitoring' : 'instrument-banner--active'}`} data-quote-cycle={lastQuoteCheck ?? selectedUpdatedAt}>
            <InstrumentArtwork symbol={selectedAsset?.symbol ?? symbol} />
            <div className="instrument-banner__copy">
              <span className="eyebrow">{t('market.selectedInstrument')}</span>
              <strong>{selectedAsset ? t(assetNameKey(selectedAsset.symbol)) : symbol}</strong>
              <span>{selectedFeedState === 'broker' ? t('market.brokerReference') : t('market.verifiedReference')} · {selectedAsset?.assetClass ? t(assetClassKey(selectedAsset.assetClass)) : t('market.marketReference')}</span>
            </div>
            <div className="instrument-banner__quote">
              <strong className="instrument-banner__price" aria-live="polite">{formatMarketPrice(livePrice)}</strong>
              <span className={selectedChange >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(selectedChange)}</span>
              <span className="instrument-banner__feed-state"><span className="instrument-banner__feed-dot" />{awaitingVerifiedQuote ? t('market.awaitingVerifiedQuote') : liveLabel}<span className={`instrument-banner__display-mode instrument-banner__display-mode--${displayMode}`}>{displayModeLabel}</span><span className="instrument-banner__signal-bars" aria-hidden="true"><i /><i /><i /></span></span>
            </div>
          </div>
          <div className="trading-chart__toolbar" aria-label={t('market.chartTools')}>
            <span className="chart-toolbar__label">{t('market.chartTools')}</span>
            <span className="chart-indicator-legend" aria-label={t('market.indicatorLegend')}><span><i />{t('market.fastAverage')}</span><span><i />{t('market.slowAverage')}</span></span>
            <button type="button" className={`chart-tool ${chartTool === 'cursor' ? 'is-active' : ''}`} onClick={() => setChartTool('cursor')} title={t('market.select')}><Crosshair size={15} /> {t('market.select')}</button>
            <button type="button" className={`chart-tool ${chartTool === 'trendline' ? 'is-active' : ''}`} onClick={() => setChartTool('trendline')} title={t('market.trendLine')}><Ruler size={15} /> {t('market.trendLine')}</button>
            <button type="button" className={`chart-tool ${chartTool === 'horizontal' ? 'is-active' : ''}`} onClick={() => setChartTool('horizontal')} title={t('market.horizontalLine')}><Minus size={15} /> {t('market.horizontalLine')}</button>
            <button type="button" className={`chart-tool ${chartTool === 'vertical' ? 'is-active' : ''}`} onClick={() => setChartTool('vertical')} title={t('market.verticalLine')}><Plus size={15} /> {t('market.verticalLine')}</button>
            <button type="button" className="chart-tool" onClick={() => setDrawings([])} title={t('market.clearDrawings')}><Undo2 size={15} /> {t('market.clearDrawings')}</button>
          </div>
          <div className="timeframe-row">
            {timeframes.map((item) => (
              <button key={item} type="button" className={`timeframe-button ${timeframe === item ? 'is-active' : ''}`} onClick={() => setTimeframe(item)}>
                {item}
              </button>
            ))}
          </div>
          {chartIsRefreshingForSymbol ? (
            <div className="chart-refresh-placeholder" role="status" aria-live="polite">
              <span className="chart-refresh-placeholder__pulse" aria-hidden="true" />
              <span>{t('ui.synchronizing')}</span>
            </div>
          ) : (
            <CandleChart key={`${symbol}-${timeframe}`} candles={market.data.candles} latestPrice={livePrice} bid={executionQuote.bid} ask={executionQuote.ask} drawTool={chartTool} drawings={drawings} onAddDrawing={(drawing) => setDrawings((current) => [...current, drawing])} />
          )}
          <div className="execution-bar">
            <button type="button" className="execution-quote execution-quote--sell" onClick={() => void openPosition('short')} disabled={!canOpen || Boolean(busyAction)}>
              <span>{t('market.sellBid')}</span><strong>{formatMarketPrice(sellPrice)}</strong><small>{t('market.openShort')}</small>
            </button>
            <div className="execution-bar__middle">
              <span className="execution-bar__label">{t('market.midpoint')}</span>
              <strong>{formatMarketPrice(livePrice)}</strong>
              <label><span>{t('market.orderLots')}</span><input type="number" min={tradeSpec.minimumLots} step="0.01" value={lotsInput} onChange={(event) => updateLots(event.target.value)} onBlur={() => { if (!Number.isFinite(Number(lotsInput)) || Number(lotsInput) < tradeSpec.minimumLots) { setLots(tradeSpec.minimumLots); setLotsInput(String(tradeSpec.minimumLots)); } }} /></label>
            </div>
            <button type="button" className="execution-quote execution-quote--buy" onClick={() => void openPosition('long')} disabled={!canOpen || Boolean(busyAction)}>
              <span>{t('market.buyAsk')}</span><strong>{formatMarketPrice(buyPrice)}</strong><small>{t('market.openLong')}</small>
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
              <StatusPill tone={canOpen ? 'success' : 'warning'}>{canOpen ? t('market.readyForPaperOrder') : !session ? t('market.signInRequired') : !hasAssetMargin ? t('market.marginRequirementNotMet') : t('market.reviewRequired')}</StatusPill>
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
              <input type="number" min={tradeSpec.minimumLots} step="0.01" value={lotsInput} onChange={(event) => updateLots(event.target.value)} onBlur={() => { if (!Number.isFinite(Number(lotsInput)) || Number(lotsInput) < tradeSpec.minimumLots) { setLots(tradeSpec.minimumLots); setLotsInput(String(tradeSpec.minimumLots)); } }} />
            </label>
            <label className="field">
              <span>{t('market.contractSize')}</span>
              <input type="number" value={contractSize} readOnly aria-readonly="true" title="Automatically calculated from the selected instrument" />
            </label>
            <label className="field">
              <span>{t('market.leverage')}</span>
              <input type="number" value={leverage} readOnly aria-readonly="true" title="Server-owned paper risk profile" />
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
              <div><span>{t('market.margin')}</span><strong>{formatCurrency(margin)}</strong></div>
            <div><span>{t('market.units')}</span><strong>{formatNumber(units)}</strong></div>
            <div><span>{t('market.pnlPerMove')}</span><strong>{formatCurrency(pnlForOneQuoteMove)}</strong><small>{t('market.pnlPerMoveHint')}</small></div>
          </div>

          <button type="button" className="btn btn--primary btn--block" onClick={() => void openPosition()} disabled={!canOpen || Boolean(busyAction)} aria-busy={Boolean(busyAction)}>
            {t('market.placeSandboxOrder')}
          </button>
          <div className="risk-note">
            <AlertTriangle size={16} />
            {!session ? t('market.signInOrderNote') : !hasAssetMargin ? `${t('market.marginShortfall')} ${formatCurrency(availableMargin)} < ${formatCurrency(margin)}.` : t('market.paperReadyNote')}
          </div>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('market.positions')}</h2>
              <p>{t('market.positionDescription')}</p>
            </div>
            <div className="panel__actions">
              <StatusPill tone={totalPnl >= 0 ? 'success' : 'critical'}>{formatCurrency(totalPnl)}</StatusPill>
              {livePositions.length ? (
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => void closeAllPositions()} disabled={Boolean(busyAction)} aria-busy={busyAction === 'close-all'}>
                  <Ban size={14} />
                  {busyAction === 'close-all' ? t('market.closing') : t('market.closeAll')}
                </button>
              ) : null}
            </div>
          </div>
          {livePositions.length ? (
            <div className="position-console">
              <div className="position-list-scroll" tabIndex={0} aria-label={t('market.positions')}>
                <div className="stack-list position-list-scroll__inner">
                  {livePositions.map((position) => {
                  const pnl = computePnl(position, position.markPrice);
                  const remaining = position.remainingLots ?? position.lots;
                  return (
                    <div
                      key={position.id}
                      className={`position-row ${selectedPosition?.id === position.id ? 'is-selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="position-row__select"
                        onClick={() => setSelectedPositionId(position.id)}
                        aria-pressed={selectedPosition?.id === position.id}
                        aria-label={`${position.symbol} ${position.side === 'long' ? t('market.long') : t('market.short')} ${t('market.positionControls')}`}
                      >
                        <strong>
                          <AssetLogo symbol={position.symbol} size="sm" />
                          {position.symbol}
                          <span className={`side-badge side-badge--${position.side}`}>{position.side === 'long' ? t('market.long') : t('market.short')}</span>
                        </strong>
                        <span>{t('market.entry')} {formatMarketCurrency(position.entryPrice)} / {t('market.exitReference')} {formatMarketCurrency(position.markPrice)}</span>
                        <span>{t('market.openLots')} {remaining.toFixed(2)} / {t('market.closedLots')} {Number(position.closedLots ?? 0).toFixed(2)} {t('market.lots')}</span>
                      </button>
                      <div className="position-row__meta">
                        <StatusPill tone={pnl >= 0 ? 'success' : 'critical'}>{formatCurrency(pnl)}</StatusPill>
                        <span>{formatDateTime(position.openedAt)}</span>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => void closePosition(position.id)}
                          disabled={Boolean(busyAction)}
                          aria-busy={busyAction === `close:${position.id}`}
                        >
                           {busyAction === `close:${position.id}` ? t('market.closing') : t('market.closePosition')}
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>

              {selectedPosition ? (
                <div className="position-editor">
                  <div className="panel__head">
                    <div>
                      <h2><Settings2 size={16} /> {selectedPosition.symbol} {t('market.positionControls')}</h2>
                      <p>{t('market.adjustRisk')}</p>
                    </div>
                    <StatusPill tone={selectedPosition.side === 'long' ? 'success' : 'critical'}>
                      {selectedPosition.side === 'long' ? t('market.long') : t('market.short')}
                    </StatusPill>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>{t('market.stopLoss')}</span>
                      <input type="number" value={editStopLoss} onChange={(event) => setEditStopLoss(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>{t('market.takeProfit')}</span>
                      <input type="number" value={editTakeProfit} onChange={(event) => setEditTakeProfit(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>{t('market.partialCloseLots')}</span>
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
                      <span>{t('market.openLots')} {t('market.lots')}</span>
                      <input value={Number(selectedPosition.remainingLots ?? selectedPosition.lots).toFixed(2)} readOnly />
                    </label>
                  </div>
                  <div className="position-editor__actions">
                    <button type="button" className="btn btn--ghost" onClick={() => void saveRiskSettings(selectedPosition.id)} disabled={Boolean(busyAction)} aria-busy={busyAction === `risk:${selectedPosition.id}`}>
                       {t('market.saveRisk')}
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => void closePartialPosition(selectedPosition.id)} disabled={Boolean(busyAction)} aria-busy={busyAction === `partial:${selectedPosition.id}`}>
                       {busyAction === `partial:${selectedPosition.id}` ? t('market.closing') : `${t('market.closePartial')} ${Number(partialLots || 0).toFixed(2)}`}
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => void closePosition(selectedPosition.id)} disabled={Boolean(busyAction)} aria-busy={busyAction === `close:${selectedPosition.id}`}>
                      <Trash2 size={16} />
                       {busyAction === `close:${selectedPosition.id}` ? t('market.closing') : t('market.closeFull')}
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

      <TimedScenarioWorkspace symbol={symbol} price={livePrice} />
    </div>
  );
}
