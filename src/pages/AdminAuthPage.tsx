import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@/data/brand';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiError } from '@/lib/api';

export function AdminAuthPage() {
  const { session, signIn } = useAuth();
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
      setError('Enter the administrator email and password.');
      return;
    }
    try {
      const result = await apiFetch<{ token: string; session: { id: string; name: string; email: string; phone?: string; country?: string; role?: 'user' | 'admin'; tradingScore?: number } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      if (result.session.role !== 'admin') {
        setError('This account does not have administrator access.');
        return;
      }
      signIn({ ...result.session, role: 'admin', token: result.token });
      navigate('/admin');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Admin service is unavailable. Confirm the service is running and try again.');
    }
  };

  return (
    <div className="admin-auth-page">
      <div className="admin-auth-card">
        <div className="admin-auth-card__brand">
          <span className="brand-lockup__mark">{brand.name}</span>
          <div><strong>AD88 Operations</strong><span>Private management console</span></div>
        </div>
        <div className="admin-auth-card__icon"><LockKeyhole size={21} /></div>
        <span className="eyebrow">Protected workspace</span>
        <h1>Administrator sign-in</h1>
        <p className="admin-auth-card__lead">The administrator console uses its own protected session. A client-side session is never required.</p>
        <div className="admin-auth-card__notice"><ShieldCheck size={16} /><span>Administrator credentials are validated only by protected server environment variables.</span></div>
        <div className="auth-form">
          <label className="field"><span>Administrator email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" /></label>
          <label className="field"><span>Administrator password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSubmit(); }} /></label>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void handleSubmit()}>Open admin console <ArrowRight size={16} /></button>
          {error ? <div className="notice-banner notice-banner--error"><LockKeyhole size={16} />{error}</div> : null}
          {!error && sessionExpired ? <div className="notice-banner notice-banner--error"><LockKeyhole size={16} />Your admin session needs verification again. If this repeats, confirm both Render services share AUTH_SECRET.</div> : null}
        </div>
        <a className="admin-auth-card__back" href="/">Return to AD88 Markets</a>
      </div>
    </div>
  );
}
