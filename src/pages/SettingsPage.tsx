import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MoonStar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/context/theme-context';
import { StatCard, StatusPill } from '@/components/Stats';
import { formatDateTime } from '@/lib/format';
import { isValidEmail, isValidInternationalPhone, maskEmail } from '@/lib/auth';
import { readStorage, writeStorage } from '@/lib/storage';
import { useLanguage } from '@/context/language-context';
import { labelCountry } from '@/lib/news-labels';

const profileCountryOptions = ['Malaysia', 'Singapore', 'China', 'Indonesia', 'Thailand', 'United States', 'United Kingdom', 'Other'] as const;
function tierLabel(t: (key: string) => string, value: string) {
  const key = value === 'Enterprise' ? 'settings.tierEnterprise' : value === 'Pro' ? 'settings.tierPro' : 'settings.tierProfessional';
  return t(key);
}

export function SettingsPage() {
  const { session, profile, updateProfile } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState('');
  const [form, setForm] = useState({
    name: profile?.name ?? session?.name ?? 'VENTURE FUNDS User',
    email: profile?.email ?? session?.email ?? 'demo@meridian.example',
    phone: profile?.phone ?? '+86 138 0000 8888',
    country: profile?.country ?? 'Malaysia',
    tier: profile?.tier === 'Core' || !profile?.tier ? 'Professional' : profile.tier,
  });
  const [security, setSecurity] = useState({
    mfa: readStorage('securityPreferences', { mfa: false, trustedDevice: false, alerts: true, apiAccess: false }).mfa,
    trustedDevice: false,
    alerts: true,
    apiAccess: false,
  });
  const [mfaVerified, setMfaVerified] = useState(() => readStorage('mfaVerified', false));
  const [mfaCode, setMfaCode] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');

  useEffect(() => {
    setForm({
      name: profile?.name ?? session?.name ?? 'VENTURE FUNDS User',
      email: profile?.email ?? session?.email ?? 'demo@meridian.example',
      phone: profile?.phone ?? '+60 12 000 0000',
      country: profile?.country ?? 'Malaysia',
      tier: profile?.tier === 'Core' || !profile?.tier ? 'Professional' : profile.tier,
    });
  }, [profile, session]);

  useEffect(() => {
    writeStorage('securityPreferences', security);
  }, [security]);

  const saveProfile = () => {
    if (!isValidEmail(form.email)) {
      setSecurityNotice(t('settings.validEmail'));
      return;
    }
    if (!isValidInternationalPhone(form.phone)) {
      setSecurityNotice(t('settings.validPhone'));
      return;
    }
    updateProfile({ name: form.name, email: form.email, phone: form.phone, country: form.country });
    setSecurityNotice(t('settings.profileSaved'));
    setSaved(t('settings.savedAt').replace('{time}', formatDateTime(new Date())));
  };

  const toggleMfa = (enabled: boolean) => {
    setSecurity((current) => ({ ...current, mfa: enabled }));
    if (enabled && !mfaVerified) setSecurityNotice(t('settings.mfaReady').replace('{email}', maskEmail(form.email)));
    if (!enabled) {
      setMfaVerified(false);
      writeStorage('mfaVerified', false);
      setSecurityNotice(t('settings.mfaDisabled'));
    }
  };

  const verifyMfa = () => {
    if (!/^\d{6}$/.test(mfaCode)) {
      setSecurityNotice(t('settings.codeRequired'));
      return;
    }
    setMfaVerified(true);
    writeStorage('mfaVerified', true);
    setSecurityNotice(t('settings.mfaEnabled'));
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        description={t('settings.description')}
        meta={<StatusPill tone="info">{t('settings.theme')}: {theme}</StatusPill>}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label={t('settings.currentRole')} value={session?.role === 'admin' ? t('ui.administrator') : session?.role === 'user' ? t('ui.client') : t('settings.guest')} note={session?.email ?? t('auth.userAccount')} />
        <StatCard label={t('settings.profileStatus')} value={profile?.status === 'active' ? t('settings.active') : profile?.status ?? t('settings.active')} note={saved || t('settings.profileSetting')} />
        <StatCard label={t('settings.workspaceTier')} value={tierLabel(t, form.tier)} note={t('settings.profileSetting')} />
        <StatCard label={t('settings.lastVerified')} value={formatDateTime(new Date())} note={t('settings.workspaceSettings')} />
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('settings.personalProfile')}</h2>
              <p>{t('settings.personalProfileHint')}</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>{t('settings.fullName')}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('settings.email')}</span>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('settings.phone')}</span>
              <input type="tel" placeholder="+60 12 345 6789" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('settings.countryRegion')}</span>
              <select value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })}>
                {profileCountryOptions.map((country) => <option key={country} value={country}>{country === 'Other' ? t('settings.otherCountry') : labelCountry(country, t)}</option>)}
              </select>
            </label>
            <div className="field field--readonly-tier">
              <span>{t('settings.workspaceTier')}</span>
              <div className="readonly-tier"><strong>{tierLabel(t, form.tier)}</strong><small>{t('settings.tierLocked')}</small></div>
            </div>
          </div>
          <button type="button" className="btn btn--primary" onClick={saveProfile}>
            <CheckCircle2 size={16} />
            {t('settings.saveProfile')}
          </button>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>{t('settings.presentationSecurity')}</h2>
              <p>{t('settings.presentationSecurityHint')}</p>
            </div>
          </div>
          <div className="settings-stack">
            <label className="field">
              <span className="field-label">
                <MoonStar size={16} />
                {t('settings.theme')}
              </span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                <option value="linen">{t('settings.day')}</option>
                <option value="graphite">{t('ui.graphite')}</option>
                <option value="midnight">{t('ui.midnight')}</option>
              </select>
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                {t('settings.twoStep')}
              </span>
              <input type="checkbox" checked={security.mfa} onChange={(event) => toggleMfa(event.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>
                <SlidersHorizontal size={16} />
                {t('settings.trustedDevice')}
              </span>
              <input type="checkbox" checked={security.trustedDevice} onChange={(event) => setSecurity({ ...security, trustedDevice: event.target.checked })} />
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                {t('settings.riskAlerts')}
              </span>
              <input type="checkbox" checked={security.alerts} onChange={(event) => setSecurity({ ...security, alerts: event.target.checked })} />
            </label>
            <label className="toggle-row">
              <span>
                <KeyRound size={16} />
                {t('settings.apiServerSide')}
              </span>
              <input type="checkbox" checked={security.apiAccess} onChange={(event) => setSecurity({ ...security, apiAccess: event.target.checked })} />
            </label>
          </div>
          {security.mfa && !mfaVerified ? (
            <div className="mfa-step">
               <strong>{t('settings.completeTwoStep')}</strong>
               <span>{t('settings.twoStepHint').replace('{email}', maskEmail(form.email))}</span>
              <div className="field-row">
                 <input inputMode="numeric" maxLength={6} placeholder={t('settings.codePlaceholder')} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))} />
                 <button type="button" className="btn btn--primary" onClick={verifyMfa}>{t('settings.verifyEnable')}</button>
              </div>
            </div>
          ) : null}
          <div className="inline-meta">
             <span>{t('settings.twoStepStatus').replace('{status}', security.mfa ? t('ui.enabled') : t('ui.off'))}</span>
             <span>{t('settings.trustedStatus').replace('{status}', security.trustedDevice ? t('ui.enabled') : t('ui.off'))}</span>
             <span>{t('settings.apiStatus').replace('{status}', security.apiAccess ? t('ui.enabled') : t('ui.off'))}</span>
          </div>
          {securityNotice ? <div className="notice-banner">{securityNotice}</div> : null}
        </article>
      </section>
    </div>
  );
}
