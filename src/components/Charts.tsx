import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import type { Candle } from '@/types';
import { useElementSize } from '@/lib/useElementSize';
import { formatNumber, getUiLocale } from '@/lib/format';
import { useLanguage } from '@/context/language-context';

function pathFromPoints(points: Array<[number, number]>) {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
}

export function Sparkline({ values, positive = true }: { values: number[]; positive?: boolean }) {
  const { t } = useLanguage();
  const { ref, size } = useElementSize<HTMLDivElement>();
  const width = Math.max(size.width, 120);
  const height = Math.max(size.height, 56);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.18;
  const domainMin = min - pad;
  const domainMax = max + pad;
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * (width - 12) + 6;
    const y = height - 8 - ((value - domainMin) / (domainMax - domainMin)) * (height - 16);
    return [x, y] as [number, number];
  });
  const d = pathFromPoints(points);

  return (
    <div className="sparkline" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('chart.priceTrend')}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className={positive ? 'sparkline__line sparkline__line--up' : 'sparkline__line sparkline__line--down'} />
        <circle cx={points.at(-1)?.[0] ?? width - 8} cy={points.at(-1)?.[1] ?? height / 2} r="3.5" className={positive ? 'sparkline__dot sparkline__dot--up' : 'sparkline__dot sparkline__dot--down'} />
      </svg>
    </div>
  );
}

export type ChartDrawing = {
  type: 'trendline' | 'horizontal' | 'vertical';
  start: [number, number];
  end: [number, number];
};

export function CandleChart({
  candles,
  latestPrice,
  bid,
  ask,
  drawTool = 'cursor',
  drawings = [],
  onAddDrawing,
}: {
  candles: Candle[];
  /** Current normalized quote; it updates the in-progress final candle. */
  latestPrice?: number;
  /** Optional paper-workspace bid/ask guides derived from the same quote. */
  bid?: number;
  ask?: number;
  drawTool?: 'cursor' | 'trendline' | 'horizontal' | 'vertical';
  drawings?: ChartDrawing[];
  onAddDrawing?: (drawing: ChartDrawing) => void;
}) {
  const { t, language } = useLanguage();
  const { ref, size } = useElementSize<HTMLDivElement>();
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const [chartNode, setChartNode] = useState<SVGSVGElement | null>(null);
  const zoomRef = useRef(1);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const setBoundedZoom = useCallback((next: number) => {
    const normalized = Math.max(1, Math.min(6, Number(next.toFixed(1))));
    zoomRef.current = normalized;
    setZoom(normalized);
  }, []);
  const width = Math.max(size.width, 320);
  const height = Math.max(size.height, 320);
  const displayCandles = useMemo(() => {
    if (!candles.length || !Number.isFinite(latestPrice) || !latestPrice || candles.at(-1)?.close === latestPrice) return candles;
    const last = candles.at(-1)!;
    // The final candle is intentionally the active bar. Historical bars stay
    // untouched while the current reference quote moves it between regular
    // upstream chart refreshes.
    return [...candles.slice(0, -1), {
      ...last,
      close: latestPrice,
      high: Math.max(last.high, latestPrice),
      low: Math.min(last.low, latestPrice),
    }];
  }, [candles, latestPrice]);
  const visibleCandleCount = Math.max(18, Math.min(displayCandles.length, Math.round(displayCandles.length / zoom)));
  const maxOffset = Math.max(0, displayCandles.length - visibleCandleCount);
  const chart = useMemo(() => {
    if (!displayCandles.length) return null;
    const normalizedOffset = Math.min(offset, maxOffset);
    const end = Math.max(visibleCandleCount, displayCandles.length - normalizedOffset);
    const visibleCandles = displayCandles.slice(Math.max(0, end - visibleCandleCount), end);
    const quoteValues = [bid, ask].filter((value): value is number => Number.isFinite(value));
    const min = Math.min(...visibleCandles.map((item) => item.low), ...quoteValues);
    const max = Math.max(...visibleCandles.map((item) => item.high), ...quoteValues);
    const pad = (max - min || 1) * 0.12;
    const domainMin = min - pad;
    const domainMax = max + pad;
    const plotHeight = height - 54;
    const plotWidth = width - 52;
    const candleWidth = Math.max(4, Math.min(22, plotWidth / visibleCandles.length * 0.6));
    const points = visibleCandles.map((candle, index) => {
      const x = 38 + (index / Math.max(visibleCandles.length - 1, 1)) * plotWidth;
      const mapY = (value: number) => 18 + (1 - (value - domainMin) / (domainMax - domainMin)) * plotHeight;
      return {
        x,
        open: mapY(candle.open),
        close: mapY(candle.close),
        high: mapY(candle.high),
        low: mapY(candle.low),
        bullish: candle.close >= candle.open,
      };
    });
    const makeEma = (period: number) => {
      const alpha = 2 / (period + 1);
      let previous = visibleCandles[0].close;
      return visibleCandles.map((candle, index) => {
        previous = index === 0 ? candle.close : candle.close * alpha + previous * (1 - alpha);
        return [38 + (index / Math.max(visibleCandles.length - 1, 1)) * plotWidth, 18 + (1 - (previous - domainMin) / (domainMax - domainMin)) * plotHeight] as [number, number];
      });
    };
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => domainMin + (domainMax - domainMin) * ratio);
    const closeLine = pathFromPoints(points.map((point) => [point.x, point.close]));
    const fastEmaLine = pathFromPoints(makeEma(9));
    const slowEmaLine = pathFromPoints(makeEma(21));
    const latest = points.at(-1);
    const timeTicks = [0, Math.floor((visibleCandles.length - 1) / 2), visibleCandles.length - 1]
      .filter((value, index, all) => all.indexOf(value) === index)
       .map((index) => ({ index, label: new Intl.DateTimeFormat(getUiLocale(), { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(visibleCandles[index].time)) }));
    const mapQuoteY = (value?: number) => Number.isFinite(value) ? 18 + (1 - ((value as number) - domainMin) / (domainMax - domainMin)) * plotHeight : undefined;
    return { points, candles: visibleCandles, candleWidth, domainMin, domainMax, yTicks, closeLine, fastEmaLine, slowEmaLine, latestCloseY: latest?.close ?? height / 2, bidY: mapQuoteY(bid), askY: mapQuoteY(ask), timeTicks };
  }, [ask, bid, displayCandles, height, language, maxOffset, offset, visibleCandleCount, width]);

  useEffect(() => {
    if (!chartNode) return undefined;
    const touchDistance = (first: Touch, second: Touch) => Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const startPinch = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinchRef.current = { distance: touchDistance(event.touches[0], event.touches[1]), zoom: zoomRef.current };
    };
    const movePinch = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const origin = pinchRef.current ?? { distance: touchDistance(event.touches[0], event.touches[1]), zoom: zoomRef.current };
      pinchRef.current = origin;
      if (!origin.distance) return;
      // Do not consume one-finger gestures: vertical page scrolling stays
      // native on mobile. Only an intentional two-finger gesture zooms chart.
      event.preventDefault();
      setBoundedZoom(origin.zoom * (touchDistance(event.touches[0], event.touches[1]) / origin.distance));
    };
    const endPinch = () => { pinchRef.current = null; };
    chartNode.addEventListener('touchstart', startPinch, { passive: true });
    chartNode.addEventListener('touchmove', movePinch, { passive: false });
    chartNode.addEventListener('touchend', endPinch, { passive: true });
    chartNode.addEventListener('touchcancel', endPinch, { passive: true });
    return () => {
      chartNode.removeEventListener('touchstart', startPinch);
      chartNode.removeEventListener('touchmove', movePinch);
      chartNode.removeEventListener('touchend', endPinch);
      chartNode.removeEventListener('touchcancel', endPinch);
    };
  }, [chartNode, setBoundedZoom]);

  if (!chart) {
    return <div className="chart-empty">{t('chart.insufficient')}</div>;
  }

  const { points, candles: chartCandles, candleWidth, domainMin, domainMax, yTicks, closeLine, fastEmaLine, slowEmaLine, latestCloseY, bidY, askY, timeTicks } = chart;
  const mapDrawingPoint = ([xRatio, yRatio]: [number, number]) => ({ x: 38 + xRatio * (width - 52), y: 18 + yRatio * (height - 54) });
  const handleChartClick = (event: MouseEvent<SVGSVGElement>) => {
    if (drawTool === 'cursor' || !onAddDrawing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width - 38) / (width - 52)));
    const y = Math.max(0, Math.min(1, ((event.clientY - rect.top) / rect.height * height - 18) / (height - 54)));
    const point: [number, number] = [x, y];
    if (drawTool === 'horizontal') {
      onAddDrawing({ type: drawTool, start: [0, y], end: [1, y] });
      return;
    }
    if (drawTool === 'vertical') {
      onAddDrawing({ type: drawTool, start: [x, 0], end: [x, 1] });
      return;
    }
    if (!pendingPoint) {
      setPendingPoint(point);
      return;
    }
    onAddDrawing({ type: drawTool, start: pendingPoint, end: point });
    setPendingPoint(null);
  };

  const changeZoom = (direction: 1 | -1) => {
    setBoundedZoom(zoomRef.current + direction * 0.5);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    // The chart takes ownership of a desktop wheel only while the pointer is
    // directly above it. Navigation and every other page region keep normal
    // browser scrolling.
    event.preventDefault();
    event.stopPropagation();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };

  const shiftWindow = (direction: 1 | -1) => {
    setOffset((current) => Math.max(0, Math.min(maxOffset, current + direction * Math.max(1, Math.round(visibleCandleCount * 0.45)))));
  };

  return (
    <div className="chart-frame" ref={ref}>
      <div className="chart-viewport__controls" aria-label={t('chart.zoomControls')}>
        <button type="button" onClick={() => shiftWindow(1)} disabled={!maxOffset} aria-label={t('chart.earlier')}>‹</button>
        <button type="button" onClick={() => changeZoom(-1)} disabled={zoom <= 1} aria-label={t('chart.zoomOut')}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(1)} disabled={zoom >= 6} aria-label={t('chart.zoomIn')}>＋</button>
        <button type="button" onClick={() => { setOffset(0); setBoundedZoom(1); }} aria-label={t('chart.latest')}>{t('chart.latest')}</button>
      </div>
      <svg ref={setChartNode} viewBox={`0 0 ${width} ${height}`} className={`chart chart--candle chart--draw-${drawTool}`} role="img" aria-label={t('chart.candlestick')} onClick={handleChartClick} onWheel={handleWheel} onDoubleClick={() => { setOffset(0); setBoundedZoom(1); }}>
        <defs>
          <linearGradient id="candleGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-grid">
          {yTicks.map((tick) => {
            const y = 18 + (1 - (tick - domainMin) / (domainMax - domainMin)) * (height - 54);
            return <line key={tick} x1="38" x2={width - 16} y1={y} y2={y} />;
          })}
        </g>
        <g className="chart-axis">
          {yTicks.map((tick) => {
            const y = 18 + (1 - (tick - domainMin) / (domainMax - domainMin)) * (height - 54);
            return (
              <text key={tick} x="10" y={y + 4} className="chart-axis__label">
                {formatNumber(tick)}
              </text>
            );
          })}
          {timeTicks.map((tick) => (
            <text key={`${tick.index}-${tick.label}`} x={points[tick.index]?.x ?? 38} y={height - 10} textAnchor="middle" className="chart-axis__label chart-axis__label--time">
              {tick.label}
            </text>
          ))}
        </g>
        <path d={`${closeLine} L ${width - 16} ${height - 36} L 38 ${height - 36} Z`} className="chart-trend-area" fill="url(#candleGlow)" />
        <path d={closeLine} className="chart-trend-line" fill="none" />
        <path d={slowEmaLine} className="chart-indicator-line chart-indicator-line--slow" fill="none" />
        <path d={fastEmaLine} className="chart-indicator-line chart-indicator-line--fast" fill="none" />
        <line x1="38" x2={width - 16} y1={latestCloseY} y2={latestCloseY} className="chart-price-guide" />
        {bidY !== undefined ? <line x1="38" x2={width - 16} y1={bidY} y2={bidY} className="chart-price-guide chart-price-guide--bid" /> : null}
        {askY !== undefined ? <line x1="38" x2={width - 16} y1={askY} y2={askY} className="chart-price-guide chart-price-guide--ask" /> : null}
        {bidY !== undefined ? <text x={width - 20} y={bidY - 5} textAnchor="end" className="chart-quote-label chart-quote-label--bid">BID</text> : null}
        {askY !== undefined ? <text x={width - 20} y={askY - 5} textAnchor="end" className="chart-quote-label chart-quote-label--ask">ASK</text> : null}
        <g className="chart-drawings">
          {drawings.map((drawing, index) => {
            const start = mapDrawingPoint(drawing.start);
            const end = mapDrawingPoint(drawing.end);
            return <line key={`${drawing.type}-${index}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={`chart-drawing chart-drawing--${drawing.type}`} />;
          })}
          {pendingPoint ? <circle cx={mapDrawingPoint(pendingPoint).x} cy={mapDrawingPoint(pendingPoint).y} r="5" className="chart-drawing__pending" /> : null}
        </g>
        {points.map((point, index) => {
          const candle = chartCandles[index];
          return (
            <g key={candle.time}>
              <line x1={point.x} x2={point.x} y1={point.high} y2={point.low} className={point.bullish ? 'chart-candle chart-candle--up' : 'chart-candle chart-candle--down'} />
              <rect
                x={point.x - candleWidth / 2}
                y={Math.min(point.open, point.close)}
                width={candleWidth}
                height={Math.max(2, Math.abs(point.open - point.close))}
                rx="1.5"
                className={point.bullish ? 'chart-candle chart-candle--up' : 'chart-candle chart-candle--down'}
              />
            </g>
          );
        })}
        <circle cx={points.at(-1)?.x ?? width - 20} cy={latestCloseY} r="4" className="chart-last-dot" />
      </svg>
    </div>
  );
}

export function DepthChart({
  bids,
  asks,
}: {
  bids: Array<{ price: number; cumulative: number }>;
  asks: Array<{ price: number; cumulative: number }>;
}) {
  const { t } = useLanguage();
  const { ref, size } = useElementSize<HTMLDivElement>();
  const width = Math.max(size.width, 320);
  const height = Math.max(size.height, 240);

  const chart = useMemo(() => {
    const values = [...bids, ...asks];
    if (!values.length) return null;
    const minPrice = Math.min(...values.map((item) => item.price));
    const maxPrice = Math.max(...values.map((item) => item.price));
    const maxDepth = Math.max(...values.map((item) => item.cumulative));
    const mapX = (price: number) => 42 + ((price - minPrice) / (maxPrice - minPrice)) * (width - 60);
    const mapY = (depth: number) => height - 30 - (depth / maxDepth) * (height - 56);
    const makePath = (points: Array<{ price: number; cumulative: number }>) =>
      pathFromPoints(points.map((point) => [mapX(point.price), mapY(point.cumulative)]));
    return {
      minPrice,
      maxPrice,
      maxDepth,
      bidsPath: makePath(bids),
      asksPath: makePath(asks),
    };
  }, [asks, bids, height, width]);

  if (!chart) {
    return <div className="chart-empty">{t('chart.depthUnavailable')}</div>;
  }

  const { minPrice, maxPrice, maxDepth, bidsPath, asksPath } = chart;

  return (
    <div className="chart-frame" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart chart--depth" role="img" aria-label={t('market.depth')}>
        <defs>
          <linearGradient id="bidDepthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="askDepthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <g className="chart-grid">
          <line x1="42" x2={width - 16} y1={height - 30} y2={height - 30} />
        </g>
        <path d={`${bidsPath} L ${width - 16} ${height - 30} L 42 ${height - 30} Z`} className="chart-depth chart-depth--bid" />
        <path d={`${asksPath} L ${width - 16} ${height - 30} L 42 ${height - 30} Z`} className="chart-depth chart-depth--ask" />
        <g className="chart-axis">
          <text x="10" y="20" className="chart-axis__label">
            {formatNumber(maxDepth)}
          </text>
          <text x="10" y={height - 32} className="chart-axis__label">
            0
          </text>
          <text x="42" y={height - 8} className="chart-axis__label">
            {formatNumber(minPrice)}
          </text>
          <text x={width - 96} y={height - 8} className="chart-axis__label">
            {formatNumber(maxPrice)}
          </text>
        </g>
      </svg>
    </div>
  );
}
