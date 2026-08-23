import { useEffect, useMemo, useRef, useState } from 'react';
import { getMarketProduct, marketProducts } from '@/data/assets';

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
