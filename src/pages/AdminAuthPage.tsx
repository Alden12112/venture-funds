import { useState } from 'react';
import { ArrowRight, Languages, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@/data/brand';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { apiFetch, ApiError } from '@/lib/api';

export function AdminAuthPage() {
  const { session, signIn } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const sessionExpired = new URLSearchParams(location.search).get('reason') === 'session';

  if (session?.role === 'admin') return <Navigate to="/admin" replace />;

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError(t('admin.auth.required'));
      return;
    }
    try {
      const result = await apiFetch<{ token: string; session: { id: string; name: string; email: string; phone?: string; country?: string; role?: 'user' | 'admin'; tradingScore?: number } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      if (result.session.role !== 'admin') {
        setError(t('admin.auth.noAccess'));
        return;
      }
      signIn({ ...result.session, role: 'admin', token: result.token });
      navigate('/admin');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('admin.auth.unavailable'));
    }
  };

  return (
    <div className="admin-auth-page">
      <div className="admin-auth-card">
        <div className="admin-auth-card__brand">
          <BrandMark />
          <div><strong>{t('admin.auth.brand')}</strong><span>{t('admin.auth.private')}</span></div>
          <label className="locale-picker locale-picker--auth">
            <Languages size={15} aria-hidden="true" />
            <span className="sr-only">{t('admin.language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t('admin.language')}>
              <option value="en">EN</option>
              <option value="zh">中文</option>
              <option value="ms">BM</option>
            </select>
          </label>
        </div>
        <div className="admin-auth-card__icon"><LockKeyhole size={21} /></div>
        <span className="eyebrow">{t('admin.auth.eyebrow')}</span>
        <h1>{t('admin.auth.title')}</h1>
        <p className="admin-auth-card__lead">{t('admin.auth.lead')}</p>
        <div className="admin-auth-card__notice"><ShieldCheck size={16} /><span>{t('admin.auth.notice')}</span></div>
        <div className="auth-form">
          <label className="field"><span>{t('admin.auth.email')}</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('admin.auth.emailPlaceholder')} /></label>
          <label className="field"><span>{t('admin.auth.password')}</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSubmit(); }} /></label>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void handleSubmit()}>{t('admin.auth.submit')} <ArrowRight size={16} /></button>
          {error ? <div className="notice-banner notice-banner--error"><LockKeyhole size={16} />{error}</div> : null}
          {!error && sessionExpired ? <div className="notice-banner notice-banner--error"><LockKeyhole size={16} />{t('admin.auth.sessionExpired')}</div> : null}
        </div>
        <a className="admin-auth-card__back" href="/">{t('admin.auth.back')}</a>
      </div>
    </div>
  );
}
