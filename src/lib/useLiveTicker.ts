import { useEffect, useMemo, useRef, useState } from 'react';
import { getMarketProduct, marketProducts } from '@/data/assets';
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
  // Display values only interpolate between two actual server references. They
  // never invent a price outside that range, and order execution remains on
  // the server's latest quote.
  const [displayPrices, setDisplayPrices] = useState<PriceMap>(fallbackPrices);
  const [displayBids, setDisplayBids] = useState<PriceMap>({});
  const [displayAsks, setDisplayAsks] = useState<PriceMap>({});
  const [changes, setChanges] = useState<PriceMap>({});
  const [directions, setDirections] = useState<DirectionMap>({});
  const [lastCheckedAt, setLastCheckedAt] = useState<TickMap>({});
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<TickMap>({});
  const [status, setStatus] = useState<QuotePulseStatus>('idle');
  const [dataStates, setDataStates] = useState<Record<string, MarketDataState>>({});
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const pricesRef = useRef<PriceMap>(fallbackPrices);
  const bidsRef = useRef<PriceMap>({});
  const asksRef = useRef<PriceMap>({});
  const displayPricesRef = useRef<PriceMap>(fallbackPrices);
  const displayBidsRef = useRef<PriceMap>({});
  const displayAsksRef = useRef<PriceMap>({});
  const smoothingTimerRef = useRef<number | null>(null);
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

  useEffect(() => () => {
    if (smoothingTimerRef.current != null) window.clearTimeout(smoothingTimerRef.current);
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
    fresh.forEach((quote) => {
      const previous = pricesRef.current[quote.symbol];
      nextDirections[quote.symbol] = previous == null ? 'flat' : quote.price > previous ? 'up' : quote.price < previous ? 'down' : 'flat';
      nextPrices[quote.symbol] = quote.price;
      if (Number.isFinite(quote.bid) && quote.bid > 0) nextBids[quote.symbol] = quote.bid;
      if (Number.isFinite(quote.ask) && quote.ask > 0) nextAsks[quote.symbol] = quote.ask;
    });
    pricesRef.current = nextPrices;
    bidsRef.current = nextBids;
    asksRef.current = nextAsks;
    directionsRef.current = nextDirections;
    setPrices(nextPrices);
    setBids(nextBids);
    setAsks(nextAsks);
    setDirections(nextDirections);
    setChanges((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.change24h])) }));
    setLastCheckedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, checkedAt])) }));
    setQuoteUpdatedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, new Date(quote.quoteUpdatedAt).getTime()])) }));
    setDataStates((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.dataState])) }));

    const fromPrices = { ...displayPricesRef.current };
    const fromBids = { ...displayBidsRef.current };
    const fromAsks = { ...displayAsksRef.current };
    const epsilon = (value: number) => Math.max(Math.abs(value) * 1e-10, 1e-7);
    const needsMotion = fresh.some((quote) => Math.abs((fromPrices[quote.symbol] ?? quote.price) - quote.price) > epsilon(quote.price));
    if (smoothingTimerRef.current != null) window.clearTimeout(smoothingTimerRef.current);

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
      smoothingTimerRef.current = null;
      return;
    }
    const startedAt = Date.now();
    const durationMs = 1_700;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      publishFrame(progress);
      if (progress < 1) smoothingTimerRef.current = window.setTimeout(tick, 120);
      else smoothingTimerRef.current = null;
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

  return { prices, bids, asks, displayPrices, displayBids, displayAsks, changes, directions, lastCheckedAt, quoteUpdatedAt, dataStates, streamStatus, status };
}
