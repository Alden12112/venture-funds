import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, ChevronUp, Crosshair, Minus, Plus, RefreshCw, Ruler, Settings2, Trash2, Undo2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CandleChart } from '@/components/Charts';
import { AssetLogo } from '@/components/AssetLogo';
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
import { assetClassKey, assetNameKey, getExecutionQuote, getMarketArtworkPriority, getMarketIcon, getMarketProduct, getMarketVisual, marketProducts } from '@/data/assets';
import { marketFilters } from '@/data/navigation';
import { apiFetch } from '@/lib/api';
import { loadRemoteCreditAccount, readCreditAccounts, writeCreditAccounts } from '@/lib/credits';
import type { CreditAccount, MarketAsset, PaperPosition, TimeframeCode } from '@/types';

const timeframes: TimeframeCode[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
const initialInstrumentSymbols = ['BTC', 'XAU', 'CL', 'ETH', 'SOL'] as const;
const initialInstrumentLimit = initialInstrumentSymbols.length;

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

function MarketShowcaseCard({ asset, active, onSelect }: { asset: MarketAsset; active: boolean; onSelect: () => void }) {
  const { t } = useLanguage();
  const image = getMarketVisual(asset.symbol);
  const product = getMarketProduct(asset.symbol);
  const movement = asset.change24h >= 0 ? 'up' : 'down';

  return (
    <button
      type="button"
      className={`market-showcase-card market-showcase-card--${product.tone} ${active ? 'is-active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className={`market-showcase-card__art ${image ? '' : 'market-showcase-card__art--fallback'}`} aria-hidden="true">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <AssetLogo symbol={asset.symbol} size="lg" />}
        <span className="market-showcase-card__veil" />
        <span className="market-showcase-card__symbol">{asset.symbol}</span>
      </span>
      <span className="market-showcase-card__body">
        <span className="market-showcase-card__identity">
          <AssetLogo symbol={asset.symbol} size="sm" />
          <span>
            <strong>{t(assetNameKey(asset.symbol))}</strong>
            <small>{t(assetClassKey(product.assetClass))}</small>
          </span>
        </span>
        <span className="market-showcase-card__quote">
          <strong>{formatMarketCurrency(asset.price)}</strong>
          <span className={`trend trend--${movement}`}>{formatPercent(asset.change24h)}</span>
        </span>
      </span>
    </button>
  );
}

function useCompactViewport() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}

export function MarketPage() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState<TimeframeCode>('M15');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [assetClassFilter, setAssetClassFilter] = useState<(typeof marketFilters)[number]>('All');
  const [showAllInstruments, setShowAllInstruments] = useState(false);
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
  const compactViewport = useCompactViewport();
  const market = useAsyncResource(() => loadMarketBundle(symbol, timeframe), [symbol, timeframe, refreshKey]);

  // Command Center market links carry a normalized symbol. Respect it once it
  // reaches the trade workspace, while still rejecting arbitrary query input.
  const requestedSymbol = searchParams.get('symbol')?.trim().toUpperCase();
  useEffect(() => {
    if (requestedSymbol && marketProducts.some((product) => product.symbol === requestedSymbol)) {
      setSymbol(requestedSymbol);
    }
  }, [requestedSymbol]);

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
  // Mobile keeps a deliberate, inspectable candle frame. Quotes still update
  // everywhere else, while the chart stops following the client-side pulse.
  const chartLatestPrice = compactViewport ? selectedBaseAsset?.price ?? livePrice : livePrice;
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
    })).sort((left, right) => {
      const leftPinnedIndex = initialInstrumentSymbols.indexOf(left.symbol as typeof initialInstrumentSymbols[number]);
      const rightPinnedIndex = initialInstrumentSymbols.indexOf(right.symbol as typeof initialInstrumentSymbols[number]);
      if (leftPinnedIndex >= 0 || rightPinnedIndex >= 0) {
        if (leftPinnedIndex < 0) return 1;
        if (rightPinnedIndex < 0) return -1;
        return leftPinnedIndex - rightPinnedIndex;
      }
      return getMarketArtworkPriority(right.symbol) - getMarketArtworkPriority(left.symbol);
    });
  }, [live.lastTickAt, live.prices, market, quotePulse.changes, quotePulse.displayPrices, quotePulse.prices, quotePulse.quoteUpdatedAt]);
  const filteredRows = useMemo(() => {
    if (assetClassFilter === 'All') return rows;
    return rows.filter((asset) => asset.assetClass === assetClassFilter);
  }, [assetClassFilter, rows]);
  const initialRows = useMemo(() => {
    if (assetClassFilter !== 'All') return filteredRows.slice(0, initialInstrumentLimit);
    const pinned = initialInstrumentSymbols
      .map((initialSymbol) => filteredRows.find((asset) => asset.symbol === initialSymbol))
      .filter((asset): asset is MarketAsset => Boolean(asset));
    return pinned.length === initialInstrumentLimit ? pinned : filteredRows.slice(0, initialInstrumentLimit);
  }, [assetClassFilter, filteredRows]);
  const visibleRows = useMemo(() => showAllInstruments ? filteredRows : initialRows, [filteredRows, initialRows, showAllInstruments]);
  const showcaseRows = useMemo(
    () => visibleRows.filter((asset) => Boolean(getMarketVisual(asset.symbol) || getMarketIcon(asset.symbol))).slice(0, initialInstrumentLimit),
    [visibleRows],
  );

  const availableMargin = creditAccount?.available ?? 0;
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

      <section className="metric-grid metric-grid--compact market-snapshot-grid">
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
            {showcaseRows.length ? (
              <div className="market-showcase" aria-label={t('market.assets')}>
                {showcaseRows.map((asset) => (
                  <MarketShowcaseCard key={`showcase-${asset.symbol}`} asset={asset} active={asset.symbol === symbol} onSelect={() => setSymbol(asset.symbol)} />
                ))}
              </div>
            ) : null}
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
          {filteredRows.length > initialInstrumentLimit ? (
            <div className="instrument-disclosure">
              <div>
                <strong>{showAllInstruments ? `${filteredRows.length}${t('market.instrumentsVisible')}` : t('market.firstView')}</strong>
                <span>{showAllInstruments ? t('market.useFilters') : `${filteredRows.length - initialInstrumentLimit}${t('market.additionalInstruments')}`}</span>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAllInstruments((value) => !value)}>
                {showAllInstruments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAllInstruments ? t('market.showFewer') : t('market.showMore')}
              </button>
            </div>
          ) : null}
        </article>

        <article className={`panel market-chart-panel market-chart-panel--pro ${compactViewport ? 'market-chart-panel--static-mobile' : ''}`}>
          <div className="panel__head">
            <div>
              <h2>{selectedAsset?.symbol} {t('market.chart')}</h2>
              <p>{timeframe} {t('market.chartSubtitle')}</p>
            </div>
            <StatusPill tone={selectedChange >= 0 ? 'success' : 'critical'}>{formatPercent(selectedChange)}</StatusPill>
          </div>
          <div key={`${symbol}-${lastQuoteCheck ?? selectedUpdatedAt}`} className={`instrument-banner instrument-banner--${selectedDirection} instrument-banner--${displayMode} instrument-banner--active`} data-quote-cycle={lastQuoteCheck ?? selectedUpdatedAt}>
            <InstrumentArtwork symbol={selectedAsset?.symbol ?? symbol} />
            <div className="instrument-banner__copy">
              <span className="eyebrow">{t('market.selectedInstrument')}</span>
              <strong>{selectedAsset ? t(assetNameKey(selectedAsset.symbol)) : symbol}</strong>
              <span>{selectedFeedState === 'broker' ? t('market.brokerReference') : t('market.verifiedReference')} · {selectedAsset?.assetClass ? t(assetClassKey(selectedAsset.assetClass)) : t('market.marketReference')}</span>
            </div>
            <div className="instrument-banner__quote">
              <strong className="instrument-banner__price" aria-live="polite">{formatMarketPrice(livePrice)}</strong>
              <span className={selectedChange >= 0 ? 'trend trend--up' : 'trend trend--down'}>{formatPercent(selectedChange)}</span>
              <span className="instrument-banner__feed-state"><span className="instrument-banner__feed-dot" />{t('market.feedLive')}<span className={`instrument-banner__display-mode instrument-banner__display-mode--${displayMode}`}>{displayModeLabel}</span><span className="instrument-banner__signal-bars" aria-hidden="true"><i /><i /><i /></span></span>
            </div>
          </div>
          <div className="trading-chart__toolbar" aria-label={t('market.chartTools')}>
            <span className="chart-toolbar__label">{t('market.chartTools')}</span>
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
            <CandleChart key={`${symbol}-${timeframe}`} candles={market.data.candles} latestPrice={chartLatestPrice} bid={executionQuote.bid} ask={executionQuote.ask} drawTool={chartTool} drawings={drawings} onAddDrawing={(drawing) => setDrawings((current) => [...current, drawing])} />
          )}
        </article>
      </section>


      <TimedScenarioWorkspace symbol={symbol} price={livePrice} availableUsdt={creditAccount?.available ?? null} />
    </div>
  );
}
