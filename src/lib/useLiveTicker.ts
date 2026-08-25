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
  const [changes, setChanges] = useState<PriceMap>({});
  const [directions, setDirections] = useState<DirectionMap>({});
  const [lastCheckedAt, setLastCheckedAt] = useState<TickMap>({});
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<TickMap>({});
  const [status, setStatus] = useState<QuotePulseStatus>('idle');
  const [dataStates, setDataStates] = useState<Record<string, MarketDataState>>({});
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const pricesRef = useRef<PriceMap>(fallbackPrices);
  const inFlight = useRef(false);
  const symbolsKey = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort().join(','),
    [symbols.join(',')],
  );

  useEffect(() => {
    pricesRef.current = { ...fallbackPrices, ...pricesRef.current };
    setPrices((current) => ({ ...fallbackPrices, ...current }));
  }, [fallbackPrices]);

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
        const nextPrices = { ...pricesRef.current };
        const nextDirections = { ...directions };
        fresh.forEach((quote) => {
          const previous = pricesRef.current[quote.symbol];
          nextDirections[quote.symbol] = previous == null ? 'flat' : quote.price > previous ? 'up' : quote.price < previous ? 'down' : 'flat';
          nextPrices[quote.symbol] = quote.price;
        });
        pricesRef.current = nextPrices;
        setPrices(nextPrices);
        setDirections(nextDirections);
        setBids((current) => ({ ...current, ...Object.fromEntries(fresh.filter((quote) => Number.isFinite(quote.bid) && quote.bid > 0).map((quote) => [quote.symbol, quote.bid])) }));
        setAsks((current) => ({ ...current, ...Object.fromEntries(fresh.filter((quote) => Number.isFinite(quote.ask) && quote.ask > 0).map((quote) => [quote.symbol, quote.ask])) }));
        setChanges((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.change24h])) }));
        setLastCheckedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, Date.now()])) }));
        setQuoteUpdatedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, new Date(quote.quoteUpdatedAt).getTime()])) }));
        setDataStates((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.dataState])) }));
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
        const nextPrices = { ...pricesRef.current };
        const nextDirections = { ...directions };
        fresh.forEach((quote) => {
          const previous = pricesRef.current[quote.symbol];
          nextDirections[quote.symbol] = previous == null ? 'flat' : quote.price > previous ? 'up' : quote.price < previous ? 'down' : 'flat';
          nextPrices[quote.symbol] = quote.price;
        });
        pricesRef.current = nextPrices;
        setPrices(nextPrices);
        setDirections(nextDirections);
        setBids((current) => ({ ...current, ...Object.fromEntries(fresh.filter((quote) => Number.isFinite(quote.bid) && quote.bid > 0).map((quote) => [quote.symbol, quote.bid])) }));
        setAsks((current) => ({ ...current, ...Object.fromEntries(fresh.filter((quote) => Number.isFinite(quote.ask) && quote.ask > 0).map((quote) => [quote.symbol, quote.ask])) }));
        setChanges((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.change24h])) }));
        setLastCheckedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, checkedAt])) }));
        setQuoteUpdatedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, new Date(quote.quoteUpdatedAt).getTime()])) }));
        setDataStates((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, quote.dataState])) }));
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

  return { prices, bids, asks, changes, directions, lastCheckedAt, quoteUpdatedAt, dataStates, streamStatus, status };
}
