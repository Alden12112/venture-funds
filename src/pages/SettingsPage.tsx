import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MoonStar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/context/theme-context';
import { DataMeta, StatCard, StatusPill } from '@/components/Stats';
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
      setSecurityNotice('请输入有效的邮箱地址。');
      return;
    }
    if (!isValidInternationalPhone(form.phone)) {
      setSecurityNotice('手机号必须带国家区号，例如 +60 12 345 6789。');
      return;
    }
    updateProfile(form);
    setSecurityNotice('个人资料已保存。');
    setSaved(`已保存于 ${formatDateTime(new Date())}`);
  };

  const toggleMfa = (enabled: boolean) => {
    setSecurity((current) => ({ ...current, mfa: enabled }));
    if (enabled && !mfaVerified) setSecurityNotice(`验证码已发送到 ${maskEmail(form.email)}（当前为本地演示验证流程）。`);
    if (!enabled) {
      setMfaVerified(false);
      writeStorage('mfaVerified', false);
      setSecurityNotice('双重验证已关闭。');
    }
  };

  const verifyMfa = () => {
    if (!/^\d{6}$/.test(mfaCode)) {
      setSecurityNotice('请输入 6 位验证码。');
      return;
    }
    setMfaVerified(true);
    writeStorage('mfaVerified', true);
    setSecurityNotice('双重验证已启用。');
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="账户"
        title="设置"
        description="个人资料、安全、通知、API 占位和主题切换都放在这里。"
        meta={<StatusPill tone="info">主题 {theme}</StatusPill>}
      />

      <section className="metric-grid metric-grid--compact">
        <StatCard label="当前身份" value={session?.role ?? 'guest'} note={session?.email ?? '未登录'} />
        <StatCard label="资料状态" value={profile?.status ?? 'active'} note={saved || '未修改'} />
        <StatCard label="成员等级" value={form.tier} note="可配置" />
        <StatCard label="最后同步" value={formatDateTime(new Date())} note="本地设置" />
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>个人资料</h2>
              <p>资料修改会同步到本地会话。</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>姓名</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="field">
              <span>邮箱</span>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="field">
              <span>手机号</span>
              <input type="tel" placeholder="+60 12 345 6789" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="field">
              <span>所在国家/地区</span>
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
              <span>等级</span>
              <select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })}>
                <option>Core</option>
                <option>Pro</option>
                <option>Enterprise</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn--primary" onClick={saveProfile}>
            <CheckCircle2 size={16} />
            保存资料
          </button>
        </article>

        <article className="panel">
          <div className="panel__head">
            <div>
              <h2>主题与安全</h2>
              <p>界面风格和账户安全策略保持分离。</p>
            </div>
          </div>
          <div className="settings-stack">
            <label className="field">
              <span className="field-label">
                <MoonStar size={16} />
                主题
              </span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                <option value="linen">日间</option>
                <option value="graphite">夜间</option>
                <option value="midnight">深海</option>
              </select>
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                双重验证
              </span>
              <input type="checkbox" checked={security.mfa} onChange={(event) => toggleMfa(event.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>
                <SlidersHorizontal size={16} />
                可信设备
              </span>
              <input type="checkbox" checked={security.trustedDevice} onChange={(event) => setSecurity({ ...security, trustedDevice: event.target.checked })} />
            </label>
            <label className="toggle-row">
              <span>
                <ShieldCheck size={16} />
                风险提醒
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
              <strong>完成双重验证</strong>
              <span>输入发送到 {maskEmail(form.email)} 的 6 位验证码。</span>
              <div className="field-row">
                <input inputMode="numeric" maxLength={6} placeholder="000000" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))} />
                <button type="button" className="btn btn--primary" onClick={verifyMfa}>验证并启用</button>
              </div>
            </div>
          ) : null}
          <div className="inline-meta">
            <span>双重验证 {security.mfa ? '启用' : '关闭'}</span>
            <span>可信设备 {security.trustedDevice ? '启用' : '关闭'}</span>
            <span>API 访问 {security.apiAccess ? '启用' : '关闭'}</span>
          </div>
          {securityNotice ? <div className="notice-banner">{securityNotice}</div> : null}
        </article>
      </section>
    </div>
  );
}
