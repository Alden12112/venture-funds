import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, Mail, Languages, RefreshCw } from 'lucide-react';
import { authModes } from '@/data/navigation';
import { brand } from '@/data/brand';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { isValidEmail, isValidInternationalPhone } from '@/lib/auth';
import { buildInternationalPhone, countryDirectory, defaultCountry, getCountryOption, isValidCountryPhone, normalizeCountryPhoneInput, phoneDigitsHint, phonePrefixHint } from '@/data/countries';
import { ApiError, apiFetch } from '@/lib/api';
import { SupportCenter, type RecoverySupportSession } from '@/components/SupportCenter';

const registeredEmailStorageKey = 'venture.pending-registration-email';

function pendingRegistrationEmail() {
  if (typeof window === 'undefined') return '';
  const candidate = window.sessionStorage.getItem(registeredEmailStorageKey) ?? '';
  return isValidEmail(candidate) ? candidate : '';
}

export function AuthPage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [delivery, setDelivery] = useState<'email' | 'phone'>('email');
  const [status, setStatus] = useState<string>('');
  const [statusKind, setStatusKind] = useState<'success' | 'error'>('success');
  const [registrationChallenge, setRegistrationChallenge] = useState<{ challengeId: string; prompt: string } | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [recovery, setRecovery] = useState<RecoverySupportSession | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [form, setForm] = useState({
    name: '',
    identifier: pendingRegistrationEmail(),
    gmail: '',
    phone: '',
    country: defaultCountry.name,
    password: '',
    confirm: '',
    code: '',
  });

  const selectedCountry = getCountryOption(form.country);
  const phoneMaxLength = Array.isArray(selectedCountry.digits) ? selectedCountry.digits[1] : selectedCountry.digits;
  const countryPrefixRule = phonePrefixHint(selectedCountry)
    ? t('auth.phonePrefixRule').replace('{prefix}', phonePrefixHint(selectedCountry))
    : '';
  const setCountry = (countryName: string) => {
    const country = getCountryOption(countryName);
    setForm((current) => ({
      ...current,
      country: country.name,
      phone: normalizeCountryPhoneInput(country, current.phone),
    }));
  };

  const currentMode = useMemo(() => {
    return authModes.find((item) => item.key === mode)?.key ?? 'login';
  }, [mode]);

  const loadRegistrationChallenge = async () => {
    setChallengeLoading(true);
    try {
      const challenge = await apiFetch<{ challengeId: string; prompt: string }>('/api/auth/registration-challenge');
      setRegistrationChallenge(challenge);
      setChallengeAnswer('');
    } catch {
      setRegistrationChallenge(null);
    } finally {
      setChallengeLoading(false);
    }
  };

  useEffect(() => {
    if (currentMode === 'register') void loadRegistrationChallenge();
    else {
      setRegistrationChallenge(null);
      setChallengeAnswer('');
    }
  }, [currentMode]);

  useEffect(() => {
    if (currentMode !== 'login') return;
    const storedEmail = pendingRegistrationEmail();
    const registeredEmail = storedEmail || (typeof location.state === 'object' && location.state
      ? (location.state as { registeredEmail?: unknown }).registeredEmail
      : undefined);
    if (typeof registeredEmail !== 'string' || !isValidEmail(registeredEmail)) return;
    setDelivery('email');
    setRegisteredEmail(registeredEmail);
    setForm((current) => ({ ...current, identifier: registeredEmail }));
    if (storedEmail) window.sessionStorage.removeItem(registeredEmailStorageKey);
    setSuccess('auth.readyFilled');
  }, [currentMode, location.state]);

  useEffect(() => {
    if (currentMode !== 'recover') setRecovery(null);
  }, [currentMode]);

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
      if (!form.gmail.trim() || !form.phone.trim()) {
        setError('auth.recoveryContactRequired');
        return;
      }
      if (!isValidEmail(form.gmail)) {
        setError('auth.validEmail');
        return;
      }
      if (!isValidInternationalPhone(form.phone)) {
        setError('auth.validPhone');
        return;
      }
      try {
        const result = await apiFetch<{ verified: boolean; recoveryToken?: string; identity?: RecoverySupportSession['identity'] }>('/api/auth/recovery/start', {
          method: 'POST',
          body: JSON.stringify({ email: form.gmail.trim(), phone: form.phone.trim() }),
        });
        if (!result.verified || !result.recoveryToken || !result.identity) {
          setRecovery(null);
          setError('auth.recoveryContactMismatch');
          return;
        }
        setRecovery({ token: result.recoveryToken, identity: result.identity });
        setSuccess('auth.recoveryChatReady');
      } catch (error) {
        setRecovery(null);
        setError(error instanceof Error ? error.message : 'auth.recoveryUnavailable');
      }
      return;
    }

    if (currentMode === 'register') {
      if (!form.name.trim() || !form.gmail.trim() || !form.phone.trim() || !form.country.trim() || !form.password || !form.confirm || !challengeAnswer.trim()) {
        setError('auth.errorRequired');
        return;
      }
      if (!registrationChallenge) {
        setError('auth.challengeUnavailable');
        return;
      }
      if (!isValidEmail(form.gmail)) {
        setError('auth.validEmail');
        return;
      }
      if (!isValidCountryPhone(selectedCountry, form.phone)) {
        setError(t('auth.completePhone').replace('{country}', selectedCountry.name).replace('{dialCode}', String(selectedCountry.dialCode)).replace('{digits}', phoneDigitsHint(selectedCountry)).replace('{prefix}', countryPrefixRule));
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
            challengeId: registrationChallenge.challengeId,
            challengeAnswer,
          }),
        });
        window.sessionStorage.setItem(registeredEmailStorageKey, form.gmail.trim());
        navigate('/auth/login', { replace: true, state: { registeredEmail: form.gmail.trim() } });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'auth.registrationFailed';
        const duplicateContact = (error instanceof ApiError && error.status === 409) || message === 'email or phone already exists';
        const invalidRegistration = error instanceof ApiError && error.status === 400 && message === 'invalid registration fields';
        setError(message === 'registration challenge failed' ? 'auth.challengeFailed' : duplicateContact ? 'auth.duplicateContact' : invalidRegistration ? 'auth.invalidRegistration' : message);
        void loadRegistrationChallenge();
        return;
      }
    }

    const loginIdentifier = (form.identifier || (delivery === 'email' ? registeredEmail : '')).trim();
    if (!loginIdentifier || !form.password) {
      setError('auth.errorLoginRequired');
      return;
    }
    if (delivery === 'email' && !isValidEmail(loginIdentifier)) {
      setError('auth.validEmail');
      return;
    }
    if (delivery === 'phone' && !isValidInternationalPhone(loginIdentifier)) {
      setError('auth.validPhone');
      return;
    }
    try {
      const result = await apiFetch<{ token: string; session: { id: string; name: string; email: string; phone?: string; country?: string; role?: 'user' | 'admin'; tradingScore?: number } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: loginIdentifier, password: form.password }),
      });
      if (result.session.role === 'admin') {
        setError('auth.adminSeparate');
        return;
      }
      signIn({ ...result.session, token: result.token });
      navigate('/app/dashboard');
      return;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'auth.signInFailed');
      return;
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-pane">
        <Link to="/" className="brand-lockup brand-lockup--auth">
          <BrandMark />
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
        <div className="auth-toolbar">
          <label className="locale-picker locale-picker--auth">
            <Languages size={15} aria-hidden="true" />
            <span className="sr-only">{t('app.language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t('app.language')}>
              <option value="en">EN</option>
              <option value="zh">中文</option>
              <option value="ms">BM</option>
            </select>
          </label>
          <div className="segmented-nav">
            {authModes.map((item) => (
              <Link key={item.key} to={`/auth/${item.key}`} className={`segmented-nav__item ${currentMode === item.key ? 'is-active' : ''}`}>
                {item.key === 'login' ? t('auth.login') : item.key === 'register' ? t('auth.register') : t('auth.recover')}
              </Link>
            ))}
          </div>
        </div>

        {currentMode === 'recover' ? (
          <div className="auth-form">
            <label className="field">
              <span>{t('auth.emailAddress')}</span>
              <input autoComplete="email" required type="email" value={form.gmail} placeholder="name@company.com" onChange={(event) => setForm({ ...form, gmail: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('auth.phone')}</span>
              <input autoComplete="tel" required type="tel" inputMode="tel" value={form.phone} placeholder="+60 12 345 6789" onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <small className="field-hint">{t('auth.recoveryPhoneHint')}</small>
            </label>
            <button type="button" className="btn btn--primary btn--block" onClick={handleSubmit}>
              {submitLabel} <ArrowRight size={16} />
            </button>
            {status ? <div className={`notice-banner notice-banner--${statusKind}`}><CheckCircle2 size={16} />{t(status)}</div> : null}
            {recovery ? <div className="auth-recovery-chat"><SupportCenter recovery={recovery} initialDraft={t('support.recoveryDraft')} /></div> : null}
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
                  <span>{t('auth.email')}</span>
                  <input autoComplete="off" required type="email" value={form.gmail} placeholder="name@company.com" onChange={(event) => setForm({ ...form, gmail: event.target.value })} />
                </label>
                <label className="field">
                  <span>{t('auth.phone')}</span>
                  <div className="phone-input">
                    <span className="phone-input__prefix">+{selectedCountry.dialCode}</span>
                   <input required type="tel" inputMode="numeric" maxLength={phoneMaxLength} value={form.phone} placeholder={t('auth.phoneDigitsPlaceholder').replace('{digits}', phoneDigitsHint(selectedCountry))} onChange={(event) => setForm({ ...form, phone: normalizeCountryPhoneInput(selectedCountry, event.target.value) })} />
                  </div>
                   <small className="field-hint">{t('auth.phoneDigitsHint').replace('{digits}', phoneDigitsHint(selectedCountry)).replace('{prefix}', countryPrefixRule)}</small>
                </label>
                <label className="field">
                  <span>{t('auth.country')}</span>
                  <select required value={form.country} onChange={(event) => setCountry(event.target.value)}>
                    {countryDirectory.map((country) => <option key={`${country.code}-${country.name}`} value={country.name}>{country.name} (+{country.dialCode})</option>)}
                  </select>
                </label>
                <label className="field auth-challenge">
                  <span>{t('auth.humanCheck')}</span>
                  <div className="field-row">
                    <span className="auth-challenge__prompt">{challengeLoading ? t('auth.challengeLoading') : registrationChallenge?.prompt ?? t('auth.challengeUnavailable')}</span>
                    <input required inputMode="numeric" maxLength={3} value={challengeAnswer} placeholder={t('auth.challengeAnswer')} onChange={(event) => setChallengeAnswer(event.target.value.replace(/[^\d-]/g, '').slice(0, 3))} />
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadRegistrationChallenge()} disabled={challengeLoading} aria-label={t('auth.challengeRefresh')}><RefreshCw size={15} />{t('auth.challengeRefresh')}</button>
                  </div>
                  <small className="field-hint">{t('auth.validationNotice')}</small>
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
                  <input autoComplete="off" required type={delivery === 'email' ? 'email' : 'tel'} placeholder={delivery === 'email' ? 'name@company.com' : '+60 12 345 6789'} value={form.identifier || (delivery === 'email' ? registeredEmail : '')} onChange={(event) => { setRegisteredEmail(''); setForm({ ...form, identifier: event.target.value }); }} />
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
             {currentMode === 'login' ? <p className="auth-helper">{t('auth.newTo')}</p> : null}
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
      </main>
    </div>
  );
}
