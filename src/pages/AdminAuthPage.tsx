import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { brand } from '@/data/brand';
import { useAuth } from '@/context/auth-context';
import { apiFetch, ApiError } from '@/lib/api';

export function AdminAuthPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (session?.role === 'admin') return <Navigate to="/admin" replace />;

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('请输入管理员邮箱和密码。');
      return;
    }
    try {
      const result = await apiFetch<{ token: string; session: { name: string; email: string; phone?: string; country?: string; role?: 'user' | 'admin'; tradingScore?: number } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      if (result.session.role !== 'admin') {
        setError('这个账号不是管理员账号。');
        return;
      }
      signIn({ ...result.session, role: 'admin', token: result.token });
      navigate('/admin');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '后台暂时无法连接，请确认服务端已启动。');
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
        <h1>后台登录</h1>
        <p className="admin-auth-card__lead">后台使用独立会话，不需要先登录前台用户端。</p>
        <div className="admin-auth-card__notice"><ShieldCheck size={16} /><span>管理员凭证只在服务端环境变量中校验。</span></div>
        <div className="auth-form">
          <label className="field"><span>管理员邮箱</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" /></label>
          <label className="field"><span>后台密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSubmit(); }} /></label>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void handleSubmit()}>进入后台 <ArrowRight size={16} /></button>
          {error ? <div className="notice-banner notice-banner--error"><LockKeyhole size={16} />{error}</div> : null}
        </div>
        <a className="admin-auth-card__back" href="/">返回 AD88 主页</a>
      </div>
    </div>
  );
}
