import { useEffect, useMemo, useRef, useState } from 'react';
import { getMarketProduct, marketProducts } from '@/data/assets';
import { loadIndicativeQuote } from '@/adapters/market-adapter';

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

/**
 * Checks the currently selected non-crypto instruments once per second. It is
 * intentionally separate from the Coinbase socket: public commodity/FX feeds
 * can be delayed by their provider, so the UI can show both the local check
 * time and the source quote timestamp without claiming a false live feed.
 */
export function useIndicativeQuotePulse(symbols: string[], fallbackPrices: PriceMap = {}) {
  const [prices, setPrices] = useState<PriceMap>(fallbackPrices);
  const [lastCheckedAt, setLastCheckedAt] = useState<TickMap>({});
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<TickMap>({});
  const [status, setStatus] = useState<QuotePulseStatus>('idle');
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
    const watched = symbolsKey.split(',').filter(Boolean).filter((symbol) => !getMarketProduct(symbol).productId);
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
      const results = await Promise.allSettled(watched.map((symbol) => loadIndicativeQuote(symbol)));
      inFlight.current = false;
      if (!active) return;
      const fresh = results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof loadIndicativeQuote>>> => result.status === 'fulfilled')
        .map((result) => result.value);
      if (fresh.length) {
        const nextPrices = { ...pricesRef.current };
        fresh.forEach((quote) => { nextPrices[quote.symbol] = quote.price; });
        pricesRef.current = nextPrices;
        setPrices(nextPrices);
        setLastCheckedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, checkedAt])) }));
        setQuoteUpdatedAt((current) => ({ ...current, ...Object.fromEntries(fresh.map((quote) => [quote.symbol, new Date(quote.quoteUpdatedAt).getTime()])) }));
        setStatus('fresh');
      } else {
        setStatus('stale');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbolsKey]);

  return { prices, lastCheckedAt, quoteUpdatedAt, status };
}
