import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, Mail } from 'lucide-react';
import { authModes } from '@/data/navigation';
import { brand } from '@/data/brand';
import { useAuth } from '@/context/auth-context';
import { EmptyState } from '@/components/Stats';
import { useLanguage } from '@/context/language-context';
import { isValidEmail, isValidInternationalPhone } from '@/lib/auth';
import { buildInternationalPhone, countryDirectory, defaultCountry, getCountryOption, isValidCountryPhone, phoneDigitsHint } from '@/data/countries';
import { apiFetch } from '@/lib/api';

export function AuthPage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { session, signIn } = useAuth();
  const { t } = useLanguage();
  const [delivery, setDelivery] = useState<'email' | 'phone'>('email');
  const [status, setStatus] = useState<string>('');
  const [statusKind, setStatusKind] = useState<'success' | 'error'>('success');
  const [form, setForm] = useState({
    name: '',
    identifier: '',
    gmail: '',
    phone: '',
    country: defaultCountry.name,
    password: '',
    confirm: '',
    code: '',
  });

  const selectedCountry = getCountryOption(form.country);
  const phoneMaxLength = Array.isArray(selectedCountry.digits) ? selectedCountry.digits[1] : selectedCountry.digits;
  const setCountry = (countryName: string) => {
    const country = getCountryOption(countryName);
    setForm((current) => ({
      ...current,
      country: country.name,
      phone: current.phone.replace(/\D/g, '').slice(0, Array.isArray(country.digits) ? country.digits[1] : country.digits),
    }));
  };

  const currentMode = useMemo(() => {
    return authModes.find((item) => item.key === mode)?.key ?? 'login';
  }, [mode]);

  if (session) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const submitLabel =
    currentMode === 'register' ? t('auth.register') : currentMode === 'recover' ? t('auth.recover') : t('auth.login');

  const setError = (message: string) => {
    setStatusKind('error');
    setStatus(message);
  };

  const setSuccess = (message: string) => {
    setStatusKind('success');
    setStatus(message);
  };

  const handleSubmit = async () => {
    if (currentMode === 'recover') {
      if (!form.identifier.trim()) {
        setError('auth.errorIdentifier');
        return;
      }
      setSuccess('auth.recoverQueued');
      return;
    }

    if (currentMode === 'register') {
      if (!form.name.trim() || !form.gmail.trim() || !form.phone.trim() || !form.country.trim() || !form.password || !form.confirm) {
        setError('auth.errorRequired');
        return;
      }
      if (!isValidEmail(form.gmail)) {
        setError('Enter a valid email address.');
        return;
      }
      if (!isValidCountryPhone(selectedCountry, form.phone)) {
        setError(`Enter a complete ${selectedCountry.name} phone number: +${selectedCountry.dialCode} followed by ${phoneDigitsHint(selectedCountry)} digits.`);
        return;
      }
      if (form.password.length < 8) {
        setError('auth.errorPasswordLength');
        return;
      }
      if (form.password !== form.confirm) {
        setError('auth.errorPasswordMatch');
        return;
      }
      try {
        await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.gmail.trim(),
            phone: buildInternationalPhone(selectedCountry, form.phone),
            country: selectedCountry.name,
            password: form.password,
          }),
        });
        setSuccess('Your account is created. You can sign in now.');
        return;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Registration failed. Please try again.');
        return;
      }
    }

    if (!form.identifier.trim() || !form.password) {
      setError('auth.errorLoginRequired');
      return;
    }
    if (delivery === 'email' && !isValidEmail(form.identifier)) {
      setError('Enter a valid email address.');
      return;
    }
    if (delivery === 'phone' && !isValidInternationalPhone(form.identifier)) {
      setError('Enter a valid phone number including its country code.');
      return;
    }
    try {
      const result = await apiFetch<{ token: string; session: { id: string; name: string; email: string; phone?: string; country?: string; role?: 'user' | 'admin'; tradingScore?: number } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: form.identifier, password: form.password }),
      });
      if (result.session.role === 'admin') {
        setError('Administrator accounts must use the separate AD88 Admin sign-in.');
        return;
      }
      signIn({ ...result.session, token: result.token });
      navigate('/app/dashboard');
      return;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
      return;
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-pane">
        <Link to="/" className="brand-lockup brand-lockup--auth">
          <span className="brand-lockup__mark">{brand.name}</span>
          <span className="brand-lockup__name">{brand.english}</span>
        </Link>
        <h1>{t('auth.title')}</h1>
        <p>{t('auth.description')}</p>
        <div className="auth-notes">
          <div className="auth-note">
            <ShieldCheck size={18} />
            <span>{t('auth.noteVerification')}</span>
          </div>
          <div className="auth-note">
            <Smartphone size={18} />
            <span>{t('auth.noteChannel')}</span>
          </div>
        </div>
      </aside>

      <main className="auth-card">
        <div className="segmented-nav">
          {authModes.map((item) => (
            <Link key={item.key} to={`/auth/${item.key}`} className={`segmented-nav__item ${currentMode === item.key ? 'is-active' : ''}`}>
              {item.key === 'login' ? t('auth.login') : item.key === 'register' ? t('auth.register') : t('auth.recover')}
            </Link>
          ))}
        </div>

        {currentMode === 'recover' ? (
          <div className="auth-form">
            <div className="field-switch">
              <button type="button" className={delivery === 'email' ? 'is-active' : ''} onClick={() => setDelivery('email')}>
                <Mail size={16} />
                {t('auth.email')}
              </button>
              <button type="button" className={delivery === 'phone' ? 'is-active' : ''} onClick={() => setDelivery('phone')}>
                <Smartphone size={16} />
                {t('auth.phone')}
              </button>
            </div>
            <label className="field">
              <span>{delivery === 'email' ? t('auth.emailAddress') : t('auth.phone')}</span>
              <input autoComplete="off" required value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('auth.verificationCode')}</span>
              <div className="field-row">
                <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={t('auth.codePlaceholder')} />
                <button type="button" className="btn btn--ghost" onClick={() => setSuccess('auth.codeSent')}>
                  {t('auth.send')}
                </button>
              </div>
            </label>
            <button type="button" className="btn btn--primary btn--block" onClick={handleSubmit}>
              {submitLabel} <ArrowRight size={16} />
            </button>
            {status ? <div className={`notice-banner notice-banner--${statusKind}`}><CheckCircle2 size={16} />{t(status)}</div> : null}
          </div>
        ) : (
          <div className="auth-form">
            {currentMode === 'register' ? (
              <>
                <label className="field">
                  <span>{t('auth.fullName')}</span>
                  <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input autoComplete="off" required type="email" value={form.gmail} placeholder="name@company.com" onChange={(event) => setForm({ ...form, gmail: event.target.value })} />
                </label>
                <label className="field">
                  <span>{t('auth.phone')}</span>
                  <div className="phone-input">
                    <span className="phone-input__prefix">+{selectedCountry.dialCode}</span>
                    <input required type="tel" inputMode="numeric" maxLength={phoneMaxLength} value={form.phone} placeholder={`Enter ${phoneDigitsHint(selectedCountry)} digits`} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, phoneMaxLength) })} />
                  </div>
                  <small className="field-hint">The country code is added automatically; enter the remaining {phoneDigitsHint(selectedCountry)} digits.</small>
                </label>
                <label className="field">
                  <span>{t('auth.country')}</span>
                  <select required value={form.country} onChange={(event) => setCountry(event.target.value)}>
                    {countryDirectory.map((country) => <option key={`${country.code}-${country.name}`} value={country.name}>{country.name} (+{country.dialCode})</option>)}
                  </select>
                </label>
              </>
            ) : null}
            {currentMode === 'login' ? (
              <>
                <div className="field-switch">
                  <button type="button" className={delivery === 'email' ? 'is-active' : ''} onClick={() => setDelivery('email')}>
                    <Mail size={16} />
                    {t('auth.email')}
                  </button>
                  <button type="button" className={delivery === 'phone' ? 'is-active' : ''} onClick={() => setDelivery('phone')}>
                    <Smartphone size={16} />
                    {t('auth.phone')}
                  </button>
                </div>
                <label className="field">
                  <span>{delivery === 'email' ? t('auth.emailAddress') : t('auth.phone')}</span>
                  <input autoComplete="off" required type={delivery === 'email' ? 'email' : 'tel'} placeholder={delivery === 'email' ? 'name@company.com' : '+60 12 345 6789'} value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} />
                </label>
              </>
            ) : null}
            <label className="field">
              <span>{currentMode === 'register' ? t('auth.createPassword') : t('auth.password')}</span>
              <input autoComplete="new-password" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            {currentMode === 'register' ? (
              <label className="field">
                <span>{t('auth.confirmPassword')}</span>
                <input autoComplete="new-password" required type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
              </label>
            ) : null}
            <button type="button" className="btn btn--primary btn--block" onClick={handleSubmit}>
              {submitLabel} <ArrowRight size={16} />
            </button>
            {currentMode === 'login' ? <p className="auth-helper">New to AD88? Create a client account first. Sign-in accepts active registered accounts only.</p> : null}
            {status ? <div className={`notice-banner notice-banner--${statusKind}`}><CheckCircle2 size={16} />{t(status)}</div> : null}
          </div>
        )}

        <div className="auth-footer">
          <div className="auth-footer__links">
            <Link to="/legal/terms">{t('legal.terms')}</Link>
            <Link to="/legal/privacy">{t('legal.privacy')}</Link>
          </div>
          <p>{t('auth.footer')}</p>
        </div>

        {status && currentMode === 'recover' ? <EmptyState title={t('auth.flowReady')} text={t(status)} /> : null}
      </main>
    </div>
  );
}
