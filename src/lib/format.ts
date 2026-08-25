export function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

/**
 * Market quotes are intentionally shown at a stable, readable precision.
 * High-value instruments such as XAU, indices and BTC use two decimals so a
 * provider payload like 4,667.7081 is rendered as 4,667.70. The underlying
 * quote is kept at full precision for the server-owned paper calculation.
 * Truncation (rather than rounding) keeps the visible tick from inventing a
 * third/fourth decimal after the display contract has been chosen.
 */
export function marketDisplayDecimals(value: number, preferredDecimals = 4) {
  if (Math.abs(value) >= 100) return 2;
  return Math.max(0, Math.min(preferredDecimals, 8));
}

export function truncateMarketValue(value: number, preferredDecimals = 4) {
  if (!Number.isFinite(value)) return value;
  const decimals = marketDisplayDecimals(value, preferredDecimals);
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

export function formatMarketPrice(value: number, preferredDecimals = 4) {
  const decimals = marketDisplayDecimals(value, preferredDecimals);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  }).format(truncateMarketValue(value, preferredDecimals));
}

export function formatMarketCurrency(value: number, currency = 'USD', preferredDecimals = 4) {
  const decimals = marketDisplayDecimals(value, preferredDecimals);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: decimals,
  }).format(truncateMarketValue(value, preferredDecimals));
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function getUiLocale() {
  if (typeof document === 'undefined') return 'zh-CN';
  if (document.documentElement.lang === 'zh-CN') return 'zh-CN';
  if (document.documentElement.lang === 'ms') return 'ms-MY';
  return 'en-GB';
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatDateTime(input: string | number | Date) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(input));
}

export function formatLongDate(input: string | number | Date) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(input));
}
