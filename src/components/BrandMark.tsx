export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`ad88-brand-mark ${compact ? 'ad88-brand-mark--compact' : ''}`} aria-label="AD88">
      <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="ad88BrandBase" x1="7" y1="6" x2="41" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#112332" />
            <stop offset="1" stopColor="#071119" />
          </linearGradient>
          <linearGradient id="ad88BrandLine" x1="12" y1="33" x2="36" y2="13" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8ee8c6" />
            <stop offset="1" stopColor="#e7f6d8" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#ad88BrandBase)" />
        <path d="M10 33.5 19.9 13h5.2l9 20.5h-5.6l-1.68-4.28h-9.54l-1.95 4.28H10Zm9.48-8.55h5.2l-2.53-6.5-2.67 6.5Zm16.1 8.55V13h3.9v20.5h-3.9Z" fill="url(#ad88BrandLine)" />
        <path d="M10 37.5h28" stroke="#7cd9bb" strokeOpacity=".52" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="35.7" cy="11.7" r="2.55" fill="#f0bb6c" />
      </svg>
    </span>
  );
}
