import { useEffect, useMemo, useRef, useState } from 'react';
import { getExecutionQuote, getMarketProduct, marketProducts } from '@/data/assets';
import { apiFetch } from '@/lib/api';
import type { MarketDataState } from '@/types';

type FeedStatus = 'connecting' | 'live' | 'stale' | 'closed';
type PriceMap = Record<string, number>;
type TickMap = Record<string, number>;
type DirectionMap = Record<string, 'up' | 'down' | 'flat'>;

const productToSymbol = Object.fromEntries(marketProducts.map((product) => [product.productId, product.symbol]));

export function useLiveTickers(fallbackPrices: PriceMap = {}) {
  const [prices, setPrices] = useState<PriceMap>(fallbackPrices);
  const [lastTickAt, setLastTickAt] = useState<TickMap>({});
  const [directions, setDirections] = useState<DirectionMap>({});
  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [clock, setClock] = useState(Date.now());
  const pricesRef = useRef<PriceMap>(fallbackPrices);

  useEffect(() => {
    pricesRef.current = { ...fallbackPrices, ...pricesRef.current };
    setPrices((current) => ({ ...fallbackPrices, ...current }));
  }, [fallbackPrices]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let closed = false;
    const socket = new WebSocket('wss://ws-feed.exchange.coinbase.com');
    setStatus('connecting');

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          product_ids: marketProducts.flatMap((product) => product.productId ? [product.productId] : []),
          channels: ['ticker'],
        }),
      );
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { type?: string; product_id?: string; price?: string; time?: string };
        if (payload.type !== 'ticker' || !payload.product_id || !payload.price) return;
        const symbol = productToSymbol[payload.product_id];
        if (!symbol) return;
        const next = Number(payload.price);
        if (!Number.isFinite(next)) return;
        const previous = pricesRef.current[symbol];
        pricesRef.current = { ...pricesRef.current, [symbol]: next };
        setPrices(pricesRef.current);
        setDirections((current) => ({
          ...current,
          [symbol]: previous == null ? 'flat' : next > previous ? 'up' : next < previous ? 'down' : 'flat',
        }));
        setLastTickAt((current) => ({
          ...current,
          [symbol]: payload.time ? new Date(payload.time).getTime() : Date.now(),
        }));
        setStatus('live');
      } catch {
        setStatus('stale');
      }
    });

    socket.addEventListener('close', () => {
      if (!closed) setStatus('closed');
    });
    socket.addEventListener('error', () => setStatus('stale'));

    return () => {
      closed = true;
      socket.close();
    };
  }, []);

  const derivedStatus = useMemo<FeedStatus>(() => {
    const ticks = Object.values(lastTickAt);
    if (!ticks.length) return status;
    const newest = Math.max(...ticks);
    return clock - newest > 8_000 ? 'stale' : status;
  }, [clock, lastTickAt, status]);

  return {
    prices,
    lastTickAt,
    directions,
    status: derivedStatus,
  };
}

export function useLiveTicker(symbol: string, fallbackPrice: number) {
  const product = getMarketProduct(symbol);
  const live = useLiveTickers({ [product.symbol]: fallbackPrice });

  return {
    price: live.prices[product.symbol] ?? fallbackPrice,
    lastTickAt: live.lastTickAt[product.symbol] ?? null,
    direction: live.directions[product.symbol] ?? 'flat',
    status: live.status,
  };
}

type QuotePulseStatus = 'idle' | 'polling' | 'fresh' | 'stale';
type StreamStatus = 'idle' | 'connecting' | 'open' | 'stale' | 'closed';
export type QuoteDisplayMode = 'verified' | 'interpolated' | 'indicative';
type QuotePulseItem = {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  change24h?: number;
  quoteUpdatedAt?: string;
  dataState?: MarketDataState;
};

/**
 * Checks one server-side snapshot every two seconds. The server owns the
 * provider fan-out and keeps a two-second cache, so every non-crypto row
 * advances from the same snapshot instead of only the selected instrument.
 */
export function useIndicativeQuotePulse(symbols: string[], fallbackPrices: PriceMap = {}) {
  const [prices, setPrices] = useState<PriceMap>(fallbackPrices);
  const [bids, setBids] = useState<PriceMap>({});
  const [asks, setAsks] = useState<PriceMap>({});
  // Display values interpolate between server references and may receive a
  // clearly-labelled, bounded UI cadence while a non-broker source is quiet.
  // Order execution always remains on the server's latest raw quote.
  const [displayPrices, setDisplayPrices] = useState<PriceMap>(fallbackPrices);
  const [displayBids, setDisplayBids] = useState<PriceMap>({});
  const [displayAsks, setDisplayAsks] = useState<PriceMap>({});
  const [changes, setChanges] = useState<PriceMap>({});
  const [directions, setDirections] = useState<DirectionMap>({});
  const [lastCheckedAt, setLastCheckedAt] = useState<TickMap>({});
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<TickMap>({});
  const [status, setStatus] = useState<QuotePulseStatus>('idle');
  const [dataStates, setDataStates] = useState<Record<string, MarketDataState>>({});
  const [displayModes, setDisplayModes] = useState<Record<string, QuoteDisplayMode>>({});
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const pricesRef = useRef<PriceMap>(fallbackPrices);
  const bidsRef = useRef<PriceMap>({});
  const asksRef = useRef<PriceMap>({});
  const displayPricesRef = useRef<PriceMap>(fallbackPrices);
  const displayBidsRef = useRef<PriceMap>({});
  const displayAsksRef = useRef<PriceMap>({});
  const displayModesRef = useRef<Record<string, QuoteDisplayMode>>({});
  const dataStatesRef = useRef<Record<string, MarketDataState>>({});
  const smoothingFrameRef = useRef<number | null>(null);
  const transitionUntilRef = useRef(0);
  const directionsRef = useRef<DirectionMap>({});
  const inFlight = useRef(false);
  const symbolsKey = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort().join(','),
    [symbols.join(',')],
  );

  useEffect(() => {
    pricesRef.current = { ...fallbackPrices, ...pricesRef.current };
    setPrices((current) => ({ ...fallbackPrices, ...current }));
    displayPricesRef.current = { ...fallbackPrices, ...displayPricesRef.current };
    setDisplayPrices((current) => ({ ...fallbackPrices, ...current }));
  }, [fallbackPrices]);

  // This is deliberately a presentation-only cadence. It keeps a quiet
  // non-crypto row visually alive between provider snapshots, but never
  // changes `prices`, `bids` or `asks` (the values used by the server-owned
  // paper order path). Broker/MT5 quotes are always shown without this layer.
  useEffect(() => {
    const stableOffset = (value: string) => {
      let hash = 0;
      for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) % 997;
      return (hash / 997) * Math.PI * 2;
    };
    const roundForDisplay = (symbol: string, value: number) => {
      const decimals = getExecutionQuote(symbol, value).decimals;
      return Number(value.toFixed(Math.min(decimals + 1, 8)));
    };
    const cadence = window.setInterval(() => {
      const now = Date.now();
      if (now < transitionUntilRef.current) return;
      const nextPrices = { ...displayPricesRef.current };
      const nextBids = { ...displayBidsRef.current };
      const nextAsks = { ...displayAsksRef.current };
      const nextModes = { ...displayModesRef.current };
      Object.entries(pricesRef.current).forEach(([symbol, reference]) => {
        const product = getMarketProduct(symbol);
        const sourceState = dataStatesRef.current[symbol];
        if (product.productId || sourceState === 'broker') {
          nextPrices[symbol] = reference;
          if (bidsRef.current[symbol] != null) nextBids[symbol] = bidsRef.current[symbol];
          if (asksRef.current[symbol] != null) nextAsks[symbol] = asksRef.current[symbol];
          nextModes[symbol] = 'verified';
          return;
        }
        const quoteSpec = getExecutionQuote(symbol, reference);
        const minimumTick = 10 ** -quoteSpec.decimals;
        // The cadence is capped well below one quote unit. It is an interface
        // pulse, not a forecast and not a market quote.
        const amplitude = Math.min(Math.max(minimumTick, Math.abs(reference) * 0.000004), 0.08);
        const offset = Math.sin(now / 760 + stableOffset(symbol)) * amplitude;
        nextPrices[symbol] = roundForDisplay(symbol, Math.max(minimumTick, reference + offset));
        if (bidsRef.current[symbol] != null) nextBids[symbol] = roundForDisplay(symbol, Math.max(minimumTick, bidsRef.current[symbol] + offset));
        if (asksRef.current[symbol] != null) nextAsks[symbol] = roundForDisplay(symbol, Math.max(minimumTick, asksRef.current[symbol] + offset));
        nextModes[symbol] = 'indicative';
      });
      displayPricesRef.current = nextPrices;
      displayBidsRef.current = nextBids;
      displayAsksRef.current = nextAsks;
      displayModesRef.current = nextModes;
      setDisplayPrices(nextPrices);
      setDisplayBids(nextBids);
      setDisplayAsks(nextAsks);
      setDisplayModes(nextModes);
    }, 720);
    return () => window.clearInterval(cadence);
  }, []);

  useEffect(() => () => {
    if (smoothingFrameRef.current != null) window.cancelAnimationFrame(smoothingFrameRef.current);
  }, []);

  const applyQuoteBatch = (fresh: Array<{
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    change24h: number;
    quoteUpdatedAt: string;
    dataState: MarketDataState;
  }>, checkedAt: number) => {
    if (!fresh.length) return;
    const nextPrices = { ...pricesRef.current };
    const nextBids = { ...bidsRef.current };
    const nextAsks = { ...asksRef.current };
    const nextDirections = { ...directionsRef.current };
    const nextDataStates = { ...dataStatesRef.current };
    const nextDisplayModes = { ...displayModesRef.current };
    fresh.forEach((quote) => {
      const previous = pricesRef.current[quote.symbol];
      nextDirections[quote.symbol] = previous == null ? 'flat' : quote.price > previous ? 'up' : quote.price < previous ? 'down' : 'flat';
      nextPrices[quote.symbol] = quote.price;
      if (Number.isFinite(quote.bid) && quote.bid > 0) nextBids[quote.symbol] = quote.bid;
      if (Number.isFinite(quote.ask) && quote.ask > 0) nextAsks[quote.symbol] = quote.ask;
      nextDataStates[quote.symbol] = quote.dataState;
      nextDisplayModes[quote.symbol] = getMarketProduct(quote.symbol).productId || quote.dataState === 'broker' ? 'verified' : 'interpolated';
    });
    pricesRef.current = nextPrices;
    bidsRef.current = nextBids;
    asksRef.current = nextAsks;
    directionsRef.current = nextDirections;
    dataStatesRef.current = nextDataStates;
    displayModesRef.current = nextDisplayModes;
    setPrices(nextPrices);
    setBids(nextBids);
    setAsks(nextAsks);
    setDirections(nextDirections);
    setChanges((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.change24h])) }));
    setLastCheckedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, checkedAt])) }));
    setQuoteUpdatedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, new Date(quote.quoteUpdatedAt).getTime()])) }));
    setDataStates(nextDataStates);
    setDisplayModes(nextDisplayModes);

    const fromPrices = { ...displayPricesRef.current };
    const fromBids = { ...displayBidsRef.current };
    const fromAsks = { ...displayAsksRef.current };
    const epsilon = (value: number) => Math.max(Math.abs(value) * 1e-10, 1e-7);
    const needsMotion = fresh.some((quote) => Math.abs((fromPrices[quote.symbol] ?? quote.price) - quote.price) > epsilon(quote.price));
    if (smoothingFrameRef.current != null) window.cancelAnimationFrame(smoothingFrameRef.current);

    const publishFrame = (progress: number) => {
      const eased = 1 - Math.pow(1 - progress, 2);
      const nextDisplayPrices = { ...fromPrices };
      const nextDisplayBids = { ...fromBids };
      const nextDisplayAsks = { ...fromAsks };
      Object.entries(nextPrices).forEach(([symbol, target]) => {
        const start = fromPrices[symbol] ?? target;
        nextDisplayPrices[symbol] = start + (target - start) * eased;
      });
      Object.entries(nextBids).forEach(([symbol, target]) => {
        const start = fromBids[symbol] ?? target;
        nextDisplayBids[symbol] = start + (target - start) * eased;
      });
      Object.entries(nextAsks).forEach(([symbol, target]) => {
        const start = fromAsks[symbol] ?? target;
        nextDisplayAsks[symbol] = start + (target - start) * eased;
      });
      displayPricesRef.current = nextDisplayPrices;
      displayBidsRef.current = nextDisplayBids;
      displayAsksRef.current = nextDisplayAsks;
      setDisplayPrices(nextDisplayPrices);
      setDisplayBids(nextDisplayBids);
      setDisplayAsks(nextDisplayAsks);
    };

    if (!needsMotion) {
      publishFrame(1);
      const settledModes = { ...displayModesRef.current };
      fresh.forEach((quote) => {
        settledModes[quote.symbol] = getMarketProduct(quote.symbol).productId || quote.dataState === 'broker' ? 'verified' : 'indicative';
      });
      displayModesRef.current = settledModes;
      setDisplayModes(settledModes);
      transitionUntilRef.current = 0;
      smoothingFrameRef.current = null;
      return;
    }
    const startedAt = Date.now();
    // Every in-between frame remains on the straight path between two
    // verified upstream snapshots. This makes metals, energy and FX appear
    // continuous without generating an invented price or overshooting a tick.
    const largestRelativeMove = fresh.reduce((largest, quote) => {
      const start = fromPrices[quote.symbol] ?? quote.price;
      return Math.max(largest, Math.abs(quote.price - start) / Math.max(Math.abs(start), 1e-9));
    }, 0);
    const durationMs = largestRelativeMove < 0.00008 ? 1_450 : Math.min(1_850, Math.max(1_100, 1_250 + largestRelativeMove * 180_000));
    transitionUntilRef.current = startedAt + durationMs;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      publishFrame(progress);
      if (progress < 1) {
        smoothingFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        const settledModes = { ...displayModesRef.current };
        fresh.forEach((quote) => {
          settledModes[quote.symbol] = getMarketProduct(quote.symbol).productId || quote.dataState === 'broker' ? 'verified' : 'indicative';
        });
        displayModesRef.current = settledModes;
        setDisplayModes(settledModes);
        smoothingFrameRef.current = null;
      }
    };
    tick();
  };

  useEffect(() => {
    const watched = symbolsKey.split(',').filter(Boolean);
    if (!watched.length || typeof EventSource === 'undefined') {
      setStreamStatus('idle');
      return;
    }
    const stream = new EventSource(`/api/market/stream?symbols=${encodeURIComponent(watched.join(','))}`);
    let active = true;
    setStreamStatus('connecting');
    const applyStreamQuotes = (event: MessageEvent<string>) => {
      if (!active) return;
      try {
        const payload = JSON.parse(event.data) as { quotes?: Record<string, QuotePulseItem> };
        const fresh = Object.entries(payload.quotes ?? {})
          .map(([symbol, quote]) => ({
            symbol: quote.symbol ?? symbol,
            price: Number(quote.price),
            bid: Number(quote.bid),
            ask: Number(quote.ask),
            change24h: Number(quote.change24h ?? 0),
            quoteUpdatedAt: quote.quoteUpdatedAt ?? new Date().toISOString(),
            dataState: quote.dataState ?? 'live',
          }))
          .filter((quote) => Number.isFinite(quote.price) && quote.price > 0);
        if (!fresh.length) return;
        applyQuoteBatch(fresh, Date.now());
      } catch {
        setStreamStatus('stale');
      }
    };
    stream.addEventListener('open', () => { if (active) setStreamStatus('open'); });
    stream.addEventListener('snapshot', applyStreamQuotes as EventListener);
    stream.addEventListener('quotes', applyStreamQuotes as EventListener);
    stream.addEventListener('state', (event) => {
      if (!active) return;
      try {
        const state = JSON.parse((event as MessageEvent<string>).data) as { connection?: string };
        if (state.connection === 'degraded') setStreamStatus('stale');
      } catch { /* retain current stream state */ }
    });
    stream.onerror = () => { if (active) setStreamStatus('stale'); };
    return () => {
      active = false;
      stream.close();
      setStreamStatus('closed');
    };
  }, [symbolsKey]);

  useEffect(() => {
    const watched = symbolsKey.split(',').filter(Boolean);
    if (!watched.length) {
      setStatus('idle');
      return;
    }
    let active = true;
    const refresh = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus('polling');
      const checkedAt = Date.now();
      let response: { quotes?: Record<string, QuotePulseItem> };
      try {
        response = await apiFetch<{ quotes?: Record<string, QuotePulseItem>; updatedAt?: string }>(`/api/market/quotes?symbols=${encodeURIComponent(watched.join(','))}`);
      } catch {
        response = {};
      }
      inFlight.current = false;
      if (!active) return;
      const fresh = Object.entries(response.quotes ?? {})
        .map(([symbol, quote]) => ({
          symbol: quote.symbol ?? symbol,
          price: Number(quote.price),
          bid: Number(quote.bid),
          ask: Number(quote.ask),
          change24h: Number(quote.change24h ?? 0),
          quoteUpdatedAt: quote.quoteUpdatedAt ?? new Date().toISOString(),
          dataState: quote.dataState ?? 'live',
        }))
        .filter((quote) => Number.isFinite(quote.price) && quote.price > 0);
      if (fresh.length) {
        applyQuoteBatch(fresh, checkedAt);
        setStatus('fresh');
      } else {
        setStatus('stale');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbolsKey]);

  return { prices, bids, asks, displayPrices, displayBids, displayAsks, displayModes, changes, directions, lastCheckedAt, quoteUpdatedAt, dataStates, streamStatus, status };
}
