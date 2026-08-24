import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MoonStar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/context/theme-context';
import { StatCard, StatusPill } from '@/components/Stats';
import { formatDateTime } from '@/lib/format';
import { isValidEmail, isValidInternationalPhone, maskEmail } from '@/lib/auth';
import { readStorage, writeStorage } from '@/lib/storage';

export function SettingsPage() {
  const { session, profile, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState('');
  const [form, setForm] = useState({
    name: profile?.name ?? session?.name ?? 'AD88 User',
    email: profile?.email ?? session?.email ?? 'demo@meridian.example',
    phone: profile?.phone ?? '+86 138 0000 8888',
    country: profile?.country ?? 'Malaysia',
    tier: profile?.tier ?? 'Core',
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
      name: profile?.name ?? session?.name ?? 'AD88 User',
      email: profile?.email ?? session?.email ?? 'demo@meridian.example',
      phone: profile?.phone ?? '+60 12 000 0000',
      country: profile?.country ?? 'Malaysia',
      tier: profile?.tier ?? 'Core',
    });
  }, [profile, session]);

  useEffect(() => {
    writeStorage('securityPreferences', security);
  }, [security]);

  const saveProfile = () => {
    if (!isValidEmail(form.email)) {
      setSecurityNotice('Enter a valid email address.');
      return;
    }
    if (!isValidInternationalPhone(form.phone)) {
      setSecurityNotice('Phone number must include its country code, for example +60 12 345 6789.');
      return;
    }
    updateProfile(form);
    setSecurityNotice('Profile saved securely.');
    setSaved(`Saved ${formatDateTime(new Date())}`);
  };

  const toggleMfa = (enabled: boolean) => {
    setSecurity((current) => ({ ...current, mfa: enabled }));
    if (enabled && !mfaVerified) setSecurityNotice(`A local verification step is ready for ${maskEmail(form.email)}. Connect an email provider before treating this as production MFA.`);
    if (!enabled) {
      setMfaVerified(false);
      writeStorage('mfaVerified', false);
      setSecurityNotice('Two-step verification is disabled.');
    }
  };

  const verifyMfa = () => {
    if (!/^\d{6}$/.test(mfaCode)) {
      setSecurityNotice('Enter a 6-digit verification code.');
      return;
    }
    setMfaVerified(true);
    writeStorage('mfaVerified', true);
    setSecurityNotice('Two-step verification is enabled for this workspace.');
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ACCOUNT CONTROL"
        title="Settings & Security"
        description="Manage personal profile, session safeguards, workspace alerts and presentation preferences in one place."
        meta={<StatusPill tone="info">Theme: {theme}</StatusPill>}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label="Current role" value={session?.role ?? 'guest'} note={session?.email ?? 'Not signed in'} />
        <StatCard label="Profile status" value={profile?.status ?? 'active'} note={saved || 'No changes yet'} />
        <StatCard label="Workspace tier" value={form.tier} note="Profile setting" />
        <StatCard label="Last verified" value={formatDateTime(new Date())} note="Workspace settings" />
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>Personal profile</h2>
              <p>Profile changes are synchronized with your signed-in workspace.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="tel" placeholder="+60 12 345 6789" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="field">
              <span>Country / region</span>
              <select value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })}>
                <option>Malaysia</option>
                <option>Singapore</option>
                <option>China</option>
                <option>Indonesia</option>
                <option>Thailand</option>
                <option>United States</option>
                <option>United Kingdom</option>
                <option>Other</option>
              </select>
            </label>
            <label className="field">
              <span>Workspace tier</span>
              <select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })}>
                <option>Core</option>
                <option>Pro</option>
                <option>Enterprise</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn--primary" onClick={saveProfile}>
            <CheckCircle2 size={16} />
            Save profile
          </button>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>Presentation & security</h2>
              <p>Visual preferences and account safeguards remain separate by design.</p>
            </div>
          </div>
          <div className="settings-stack">
            <label className="field">
              <span className="field-label">
                <MoonStar size={16} />
                Theme
              </span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                <option value="linen">Day</option>
                <option value="graphite">Graphite</option>
                <option value="midnight">Midnight</option>
              </select>
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                Two-step verification
              </span>
              <input type="checkbox" checked={security.mfa} onChange={(event) => toggleMfa(event.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>
                <SlidersHorizontal size={16} />
                Trusted device
              </span>
              <input type="checkbox" checked={security.trustedDevice} onChange={(event) => setSecurity({ ...security, trustedDevice: event.target.checked })} />
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                Risk alerts
              </span>
              <input type="checkbox" checked={security.alerts} onChange={(event) => setSecurity({ ...security, alerts: event.target.checked })} />
            </label>
            <label className="toggle-row">
              <span>
                <KeyRound size={16} />
                API keys remain server-side
              </span>
              <input type="checkbox" checked={security.apiAccess} onChange={(event) => setSecurity({ ...security, apiAccess: event.target.checked })} />
            </label>
          </div>
          {security.mfa && !mfaVerified ? (
            <div className="mfa-step">
              <strong>Complete two-step verification</strong>
              <span>Enter the 6-digit verification code for {maskEmail(form.email)}.</span>
              <div className="field-row">
                <input inputMode="numeric" maxLength={6} placeholder="000000" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))} />
                <button type="button" className="btn btn--primary" onClick={verifyMfa}>Verify and enable</button>
              </div>
            </div>
          ) : null}
          <div className="inline-meta">
            <span>Two-step verification: {security.mfa ? 'Enabled' : 'Off'}</span>
            <span>Trusted device: {security.trustedDevice ? 'Enabled' : 'Off'}</span>
            <span>API access: {security.apiAccess ? 'Enabled' : 'Off'}</span>
          </div>
          {securityNotice ? <div className="notice-banner">{securityNotice}</div> : null}
        </article>
      </section>
    </div>
  );
}
