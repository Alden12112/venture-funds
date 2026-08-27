export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`ad88-brand-mark ${compact ? 'ad88-brand-mark--compact' : ''}`} aria-label="VENTURE FUNDS">
      <img src="/assets/venture-funds/venture-funds-logo.png" alt="" role="presentation" decoding="async" />
    </span>
  );
}
